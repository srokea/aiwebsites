// Synchronizacja Meetow (leads.google_term) z kalendarzami iCloud sparowanych osob.
//
// Model: uzgadnianie stanu, nie "zdarzenia". Kazdy przebieg liczy, jakie wydarzenia POWINNY
// byc w kalendarzu danej osoby, porownuje z tym, co juz wyslalismy (calendar_events) i robi
// tylko roznice: nowy termin -> PUT, zmieniony termin/firma/telefon -> PUT pod ten sam adres
// (wydarzenie sie przesuwa), wyczyszczony termin / skasowany lead / zmiana dzwoniacego -> DELETE.
// Dzieki temu nie trzeba wpinac sie w kazdy endpoint z osobna - wystarczy "kopnac" sync po
// zmianie (index.js robi to po kazdym udanym zapisie leadow/nisz/kont) i co 10 minut na wszelki
// wypadek (np. chwilowy brak sieci przy poprzednim przebiegu).
//
// Wydarzenie trafia tylko do tych, ktorzy go chca: domyslnie scope 'mine' = Meety, gdzie ta
// osoba jest "Kto dzwonil", a gdy lead nie ma jeszcze dzwoniacego - osoba, ktora ustawila termin
// (leads.google_term_by). Ta sama regula co w kalendarzyku wyboru terminu (api.js openTermPicker).
// Przeszlych Meetow NIE dosylamy wstecz (parowanie nie zasypie kalendarza historia), ale juz
// wyslanych nie kasujemy, kiedy mina - zostaja w kalendarzu jako historia.

const db = require("./db");
const caldav = require("./caldav");
const secret = require("./calendarSecret");
const { buildMeetEvent, buildTestEvent, addMinutes } = require("./ics");

const TERM_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PERIODIC_MS = 10 * 60 * 1000;
const DEBOUNCE_MS = 1500;

const SCOPES = ["mine", "all"];
const DURATIONS = [15, 30, 45, 60, 90];
const ALARMS = [-1, 0, 5, 10, 15, 30, 60];

class SyncError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Biezaca data-godzina w Polsce ("YYYY-MM-DDTHH:MM") - kontener moze chodzic w UTC, a terminy
// w bazie sa w czasie polskim.
function warsawNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function meetingOwner(lead) {
  return lead.caller || lead.google_term_by || "";
}

function accountFor(userId) {
  return db.prepare("SELECT * FROM calendar_accounts WHERE user_id = ?").get(userId) || null;
}

function authFor(acc) {
  let password;
  try {
    password = secret.decrypt(acc.secret);
  } catch {
    throw new caldav.CalDavError("Nie da się odczytać zapisanego hasła (zmieniony klucz?) — połącz kalendarz ponownie.", "auth");
  }
  return caldav.basicAuth(acc.username, password);
}

function setStatus(userId, { status, lastError = "", synced = false }) {
  db.prepare(
    `UPDATE calendar_accounts SET status = ?, last_error = ?, updated_at = datetime('now')
       ${synced ? ", last_sync_at = datetime('now')" : ""} WHERE user_id = ?`
  ).run(status, lastError, userId);
}

function leadsWithTerms() {
  return db
    .prepare(
      `SELECT leads.id, leads.company_name, leads.city, leads.phone, leads.website_url, leads.caller,
              leads.google_term, leads.google_term_by, niches.name AS niche_name
         FROM leads JOIN niches ON niches.id = leads.niche_id
        WHERE leads.google_term <> ''`
    )
    .all()
    .filter((l) => TERM_FORMAT.test(l.google_term));
}

// ---------- kolejka: jeden przebieg naraz, kolejne prosby sklejaja sie w jeden ----------
let chain = Promise.resolve();
let queued = null;

function exclusive(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

// forceUserId: przebieg rowniez dla konta w stanie 'auth_error' (reczne "Synchronizuj teraz")
function syncAll({ forceUserId } = {}) {
  if (!queued) {
    const job = { forceUsers: new Set() };
    job.promise = exclusive(() => {
      if (queued === job) queued = null;
      return runAll(job.forceUsers);
    });
    queued = job;
  }
  if (forceUserId != null) queued.forceUsers.add(forceUserId);
  return queued.promise;
}

let debounceTimer = null;
function kick() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncAll().catch((err) => console.error("[kalendarz] blad synchronizacji:", err.message));
  }, DEBOUNCE_MS);
  debounceTimer.unref?.();
}

function hasAccounts() {
  return db.prepare("SELECT 1 FROM calendar_accounts WHERE calendar_url <> '' LIMIT 1").get() != null;
}

async function runAll(forceUsers = new Set()) {
  const accounts = db
    .prepare("SELECT * FROM calendar_accounts WHERE calendar_url <> ''")
    .all()
    .filter((a) => a.status !== "auth_error" || forceUsers.has(a.user_id));
  if (!accounts.length) return { results: [] };

  const leads = leadsWithTerms();
  const today = warsawNow().slice(0, 10);
  const results = [];
  for (const acc of accounts) {
    try {
      results.push(await syncAccount(acc, leads, today));
    } catch (err) {
      console.error(`[kalendarz] konto ${acc.user_id}:`, err);
      results.push({ userId: acc.user_id, name: "", created: 0, updated: 0, deleted: 0, failed: 1, actions: [], error: err.message });
    }
  }
  return { results };
}

async function syncAccount(acc, leads, today) {
  const user = db.prepare("SELECT id, display_name FROM users WHERE id = ?").get(acc.user_id);
  const out = { userId: acc.user_id, name: user ? user.display_name : "", created: 0, updated: 0, deleted: 0, failed: 0, actions: [], error: "" };
  if (!user) return out;

  let auth;
  try {
    auth = authFor(acc);
  } catch (err) {
    setStatus(acc.user_id, { status: "auth_error", lastError: err.message });
    out.error = err.message;
    return out;
  }

  const wanted = new Map();
  for (const lead of leads) {
    if (acc.scope === "all" || meetingOwner(lead) === user.display_name) wanted.set(lead.id, lead);
  }

  const rows = db.prepare("SELECT * FROM calendar_events WHERE user_id = ?").all(acc.user_id);
  const rowByLead = new Map(rows.map((r) => [r.lead_id, r]));
  const deleteRow = db.prepare("DELETE FROM calendar_events WHERE user_id = ? AND lead_id = ?");
  const upsertRow = db.prepare(
    `INSERT INTO calendar_events (user_id, lead_id, calendar_url, href, term, content_hash, etag, synced_at)
     VALUES (@user_id, @lead_id, @calendar_url, @href, @term, @content_hash, @etag, datetime('now'))
     ON CONFLICT(user_id, lead_id) DO UPDATE SET calendar_url = excluded.calendar_url, href = excluded.href,
       term = excluded.term, content_hash = excluded.content_hash, etag = excluded.etag, synced_at = excluded.synced_at`
  );

  const errors = [];
  // null = OK, inaczej blad. Blad logowania przerywa caly przebieg tego konta - nie ma sensu
  // walic w iCloud kolejnymi requestami ze zlym haslem.
  const attempt = async (leadId, fn) => {
    try {
      await fn();
      return null;
    } catch (err) {
      if (err.code === "auth") throw err;
      errors.push(err.message);
      out.failed++;
      out.actions.push({ leadId, action: "error", error: err.message });
      return err;
    }
  };

  try {
    for (const row of rows) {
      if (wanted.has(row.lead_id)) continue;
      const err = await attempt(row.lead_id, () => caldav.deleteEvent({ auth, url: row.href }));
      // 403 = nie mamy juz prawa do tamtego kalendarza - nic wiecej nie zrobimy, zapominamy wpis
      if (!err || err.code === "forbidden") {
        deleteRow.run(acc.user_id, row.lead_id);
        out.deleted++;
        out.actions.push({ leadId: row.lead_id, action: "deleted" });
      }
    }

    for (const lead of wanted.values()) {
      const row = rowByLead.get(lead.id);
      const event = buildMeetEvent(lead, {
        userId: acc.user_id,
        ownerName: meetingOwner(lead),
        durationMin: acc.duration_min,
        alarmMin: acc.alarm_min,
        appUrl: acc.app_url,
      });
      if (row && row.calendar_url === acc.calendar_url && row.content_hash === event.hash) continue;
      if (!row && lead.google_term.slice(0, 10) < today) continue;

      // zmieniony kalendarz docelowy - sprzatamy w starym (best effort, blad nie blokuje nowego)
      if (row && row.calendar_url !== acc.calendar_url) {
        await caldav.deleteEvent({ auth, url: row.href }).catch((err) => {
          if (err.code === "auth") throw err;
        });
      }

      const href = acc.calendar_url + event.fileName;
      let etag = "";
      const err = await attempt(lead.id, async () => {
        ({ etag } = await caldav.putEvent({ auth, url: href, ics: event.ics }));
      });
      if (err) continue;
      upsertRow.run({
        user_id: acc.user_id,
        lead_id: lead.id,
        calendar_url: acc.calendar_url,
        href,
        term: lead.google_term,
        content_hash: event.hash,
        etag,
      });
      if (row) out.updated++;
      else out.created++;
      out.actions.push({ leadId: lead.id, action: row ? "updated" : "created" });
    }
  } catch (err) {
    if (err.code !== "auth") throw err;
    setStatus(acc.user_id, { status: "auth_error", lastError: err.message });
    out.error = err.message;
    return out;
  }

  if (errors.length) setStatus(acc.user_id, { status: "error", lastError: errors[0], synced: true });
  else setStatus(acc.user_id, { status: "ok", synced: true });
  out.error = errors[0] || "";
  return out;
}

// ---------- operacje z okna parowania ----------

function publicAccount(acc) {
  if (!acc) return null;
  const today = warsawNow().slice(0, 10);
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS events, SUM(CASE WHEN substr(term, 1, 10) >= ? THEN 1 ELSE 0 END) AS upcoming
         FROM calendar_events WHERE user_id = ?`
    )
    .get(today, acc.user_id);
  return {
    provider: acc.provider,
    username: acc.username,
    hasCalendar: Boolean(acc.calendar_url),
    calendarName: acc.calendar_name,
    calendarColor: acc.calendar_color,
    scope: acc.scope,
    durationMin: acc.duration_min,
    alarmMin: acc.alarm_min,
    status: acc.status,
    lastError: acc.last_error,
    lastSyncAt: acc.last_sync_at,
    hasTest: Boolean(acc.test_href),
    events: counts.events || 0,
    upcoming: counts.upcoming || 0,
  };
}

// Haslo do aplikacji Apple to 16 malych liter pokazywanych jako "abcd-efgh-ijkl-mnop". Ludzie
// wpisuja je roznie (spacje zamiast myslnikow, bez myslnikow, z WIELKIMI) - sprowadzamy do
// formatu, w jakim pokazuje je Apple. Cokolwiek innego zostaje bez zmian (np. inny serwer CalDAV).
function normalizeAppPassword(raw) {
  const compact = String(raw || "").trim();
  const letters = compact.replace(/[\s-]+/g, "");
  if (/^[a-z]{16}$/i.test(letters)) return letters.toLowerCase().match(/.{4}/g).join("-");
  return compact;
}

function cleanAppUrl(appUrl) {
  try {
    const u = new URL(appUrl);
    return /^https?:$/.test(u.protocol) ? u.origin : "";
  } catch {
    return "";
  }
}

// Krok 1 parowania: Apple ID + haslo do aplikacji. Sprawdza logowanie (od razu 401 przy zlym
// hasle) i zwraca liste kalendarzy do wyboru. Haslo zapisuje sie dopiero, gdy iCloud je przyjal.
async function connect(userId, { username, password, appUrl, serverUrl = caldav.ICLOUD_URL }) {
  const login = String(username || "").trim();
  const pass = normalizeAppPassword(password);
  if (!login || !pass) throw new SyncError("Podaj Apple ID i hasło do aplikacji");

  const found = await caldav.discover({ username: login, password: pass, serverUrl });

  return exclusive(() => {
    const prev = accountFor(userId);
    const sameLogin = prev && prev.username.toLowerCase() === login.toLowerCase() && prev.server_url === serverUrl;
    const keepCalendar = sameLogin && found.calendars.some((c) => c.url === prev.calendar_url);
    db.transaction(() => {
      // inne konto Apple = wpisy o starych wydarzeniach nic juz nie znacza (tamtego kalendarza nie widzimy)
      if (!sameLogin) db.prepare("DELETE FROM calendar_events WHERE user_id = ?").run(userId);
      db.prepare(
        `INSERT INTO calendar_accounts (user_id, provider, server_url, username, secret, home_url, calendar_url,
                                        calendar_name, calendar_color, app_url, status, last_error, test_href)
         VALUES (@user_id, 'icloud', @server_url, @username, @secret, @home_url, @calendar_url,
                 @calendar_name, @calendar_color, @app_url, 'ok', '', '')
         ON CONFLICT(user_id) DO UPDATE SET server_url = excluded.server_url, username = excluded.username,
           secret = excluded.secret, home_url = excluded.home_url, calendar_url = excluded.calendar_url,
           calendar_name = excluded.calendar_name, calendar_color = excluded.calendar_color,
           app_url = CASE WHEN excluded.app_url <> '' THEN excluded.app_url ELSE calendar_accounts.app_url END,
           status = 'ok', last_error = '',
           test_href = CASE WHEN @same_login THEN calendar_accounts.test_href ELSE '' END,
           updated_at = datetime('now')`
      ).run({
        user_id: userId,
        server_url: serverUrl,
        username: login,
        secret: secret.encrypt(pass),
        home_url: found.homeUrl,
        calendar_url: keepCalendar ? prev.calendar_url : "",
        calendar_name: keepCalendar ? prev.calendar_name : "",
        calendar_color: keepCalendar ? prev.calendar_color : "",
        app_url: cleanAppUrl(appUrl),
        same_login: sameLogin ? 1 : 0,
      });
    })();
    return { calendars: found.calendars, account: publicAccount(accountFor(userId)) };
  });
}

async function listCalendarsFor(userId) {
  const acc = accountFor(userId);
  if (!acc) throw new SyncError("Kalendarz nie jest połączony");
  return caldav.listCalendars({ auth: authFor(acc), homeUrl: acc.home_url });
}

// Krok 2: wybor istniejacego kalendarza albo utworzenie nowego. Od razu pierwszy sync, zeby
// nadchodzace Meety pojawily sie na iPhonie jeszcze zanim okno parowania sie zamknie.
async function chooseCalendar(userId, { url, createName, color }) {
  const acc = accountFor(userId);
  if (!acc) throw new SyncError("Najpierw połącz konto iCloud");
  const auth = authFor(acc);

  let cal;
  if (createName) {
    const name = String(createName).trim().slice(0, 60);
    if (!name) throw new SyncError("Podaj nazwę nowego kalendarza");
    cal = await caldav.createCalendar({ auth, homeUrl: acc.home_url, name, color: caldav.normalizeColor(color) || "#6090e0" });
  } else {
    const list = await caldav.listCalendars({ auth, homeUrl: acc.home_url });
    cal = list.find((c) => c.url === url);
    if (!cal) throw new SyncError("Nie znaleziono tego kalendarza na koncie iCloud — odśwież listę");
  }

  await exclusive(() =>
    db
      .prepare(
        `UPDATE calendar_accounts SET calendar_url = ?, calendar_name = ?, calendar_color = ?, status = 'ok',
                last_error = '', updated_at = datetime('now') WHERE user_id = ?`
      )
      .run(cal.url, cal.name, cal.color, userId)
  );
  const { results } = await syncAll({ forceUserId: userId });
  return { account: publicAccount(accountFor(userId)), result: results.find((r) => r.userId === userId) || null };
}

async function updateSettings(userId, body, appUrl) {
  const acc = accountFor(userId);
  if (!acc) throw new SyncError("Kalendarz nie jest połączony");
  const next = { scope: acc.scope, duration_min: acc.duration_min, alarm_min: acc.alarm_min };
  if ("scope" in body) {
    if (!SCOPES.includes(body.scope)) throw new SyncError("Nieprawidłowy zakres spotkań");
    next.scope = body.scope;
  }
  if ("durationMin" in body) {
    if (!DURATIONS.includes(Number(body.durationMin))) throw new SyncError("Nieprawidłowa długość spotkania");
    next.duration_min = Number(body.durationMin);
  }
  if ("alarmMin" in body) {
    if (!ALARMS.includes(Number(body.alarmMin))) throw new SyncError("Nieprawidłowe przypomnienie");
    next.alarm_min = Number(body.alarmMin);
  }
  const cleanUrl = cleanAppUrl(appUrl);
  await exclusive(() =>
    db
      .prepare(
        `UPDATE calendar_accounts SET scope = @scope, duration_min = @duration_min, alarm_min = @alarm_min,
                app_url = CASE WHEN @app_url <> '' THEN @app_url ELSE app_url END, updated_at = datetime('now')
          WHERE user_id = @user_id`
      )
      .run({ ...next, app_url: cleanUrl, user_id: userId })
  );
  const { results } = await syncAll({ forceUserId: userId });
  return { account: publicAccount(accountFor(userId)), result: results.find((r) => r.userId === userId) || null };
}

async function syncNow(userId) {
  const acc = accountFor(userId);
  if (!acc || !acc.calendar_url) throw new SyncError("Kalendarz nie jest połączony");
  const { results } = await syncAll({ forceUserId: userId });
  return { account: publicAccount(accountFor(userId)), result: results.find((r) => r.userId === userId) || null };
}

// zaokraglenie w gore do pelnych 5 minut, min. 10 minut od teraz - zeby test byl "zaraz", ale w przyszlosci
function soonTerm() {
  const now = warsawNow();
  const t = addMinutes(now, 10);
  const minutes = Number(t.slice(14, 16));
  return addMinutes(t, (5 - (minutes % 5)) % 5);
}

async function sendTestEvent(userId) {
  const acc = accountFor(userId);
  if (!acc || !acc.calendar_url) throw new SyncError("Najpierw wybierz kalendarz");
  const start = soonTerm();
  const ev = buildTestEvent({ userId, startTerm: start });
  const href = acc.calendar_url + ev.fileName;
  await caldav.putEvent({ auth: authFor(acc), url: href, ics: ev.ics });
  db.prepare("UPDATE calendar_accounts SET test_href = ?, updated_at = datetime('now') WHERE user_id = ?").run(href, userId);
  return { start, account: publicAccount(accountFor(userId)) };
}

async function removeTestEvent(userId) {
  const acc = accountFor(userId);
  if (!acc || !acc.test_href) return { account: publicAccount(acc) };
  await caldav.deleteEvent({ auth: authFor(acc), url: acc.test_href });
  db.prepare("UPDATE calendar_accounts SET test_href = '', updated_at = datetime('now') WHERE user_id = ?").run(userId);
  return { account: publicAccount(accountFor(userId)) };
}

// Rozlaczenie. removeEvents = przy okazji zdejmij z kalendarza NADCHODZACE Meety dodane przez
// appke (przeszle zostaja jako historia). Bez tego wydarzenia zostaja, appka tylko o nich zapomina.
function disconnect(userId, { removeEvents = false } = {}) {
  return exclusive(async () => {
    const acc = accountFor(userId);
    if (!acc) return { removed: 0, failed: 0 };
    let removed = 0;
    let failed = 0;
    if (removeEvents) {
      let auth = null;
      try {
        auth = authFor(acc);
      } catch {
        failed = -1; // nie da sie zalogowac - nic nie usuniemy, ale rozlaczyc i tak trzeba
      }
      if (auth) {
        const today = warsawNow().slice(0, 10);
        const rows = db
          .prepare("SELECT href FROM calendar_events WHERE user_id = ? AND substr(term, 1, 10) >= ?")
          .all(userId, today);
        const hrefs = rows.map((r) => r.href);
        if (acc.test_href) hrefs.push(acc.test_href);
        for (const href of hrefs) {
          try {
            await caldav.deleteEvent({ auth, url: href });
            removed++;
          } catch {
            failed++;
          }
        }
      }
    }
    db.transaction(() => {
      db.prepare("DELETE FROM calendar_events WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM calendar_accounts WHERE user_id = ?").run(userId);
    })();
    return { removed, failed: Math.max(failed, 0) };
  });
}

// Po zmianie terminu w UI (kalendarzyk) - wymus sync od razu i powiedz, gdzie ten Meet teraz jest,
// zeby front mogl pokazac "Dodano do kalendarza iCloud" zamiast kazac wierzyc na slowo.
async function flushForLead(leadId) {
  if (!hasAccounts()) return { connected: false, inCalendars: [], actions: [] };
  const { results } = await syncAll();
  const actions = results.flatMap((r) =>
    r.actions.filter((a) => a.leadId === leadId).map((a) => ({ ...a, userId: r.userId, name: r.name }))
  );
  const inCalendars = db
    .prepare(
      `SELECT users.id AS userId, users.display_name AS name FROM calendar_events
         JOIN users ON users.id = calendar_events.user_id WHERE calendar_events.lead_id = ?`
    )
    .all(leadId);
  return { connected: true, inCalendars, actions };
}

function start() {
  const tick = () => {
    if (!hasAccounts()) return;
    syncAll().catch((err) => console.error("[kalendarz] blad synchronizacji:", err.message));
  };
  setTimeout(tick, 5000).unref?.();
  setInterval(tick, PERIODIC_MS).unref?.();
}

module.exports = {
  SyncError,
  SCOPES,
  DURATIONS,
  ALARMS,
  meetingOwner,
  normalizeAppPassword,
  warsawNow,
  accountFor,
  publicAccount,
  connect,
  listCalendarsFor,
  chooseCalendar,
  updateSettings,
  syncNow,
  syncAll,
  sendTestEvent,
  removeTestEvent,
  disconnect,
  flushForLead,
  kick,
  hasAccounts,
  start,
};
