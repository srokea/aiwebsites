// npm test - parowanie i synchronizacja z kalendarzem iCloud na atrapie serwera CalDAV.
// Atrapa udaje iCloud: konto (principal) na jednym hoscie, kalendarze na DRUGIM (jak
// caldav.icloud.com -> pNN-caldav.icloud.com), kalendarz Przypomnien (tylko VTODO), kalendarz
// udostepniony tylko do odczytu, skrzynka zaproszen i 401 przy zlym hasle.
process.env.DB_FILE = ":memory:";
process.env.CALENDAR_SECRET = "test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const db = require("./db");
const caldav = require("./caldav");
const ics = require("./ics");
const sync = require("./calendarSync");

const USER = "jan@icloud.com";
const PASS = "abcd-efgh-ijkl-mnop";

// ---------- atrapa iCloud ----------
function startMockICloud() {
  const resources = new Map(); // sciezka -> tresc .ics
  const calendars = new Map([
    ["/1234/calendars/home/", { name: "Dom", color: "#FF2968FF", comps: ["VEVENT"], ro: false }],
    ["/1234/calendars/work/", { name: "Praca &amp; spotkania", color: "#1BADF8FF", comps: ["VEVENT", "VTODO"], ro: false }],
    ["/1234/calendars/tasks/", { name: "Przypomnienia", color: "#CC73E1FF", comps: ["VTODO"], ro: false }],
    ["/1234/calendars/shared/", { name: "Udostępniony", color: "#63DA38FF", comps: ["VEVENT"], ro: true }],
  ]);
  const log = [];
  let homeOrigin = "";

  const authorized = (req) => req.headers.authorization === caldav.basicAuth(USER, PASS);

  const handler = (host) => (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      log.push({ host, method: req.method, url: req.url, body });
      if (!authorized(req)) {
        res.writeHead(401, { "WWW-Authenticate": 'Basic realm="iCloud"' });
        return res.end();
      }
      const send207 = (xml) => {
        res.writeHead(207, { "Content-Type": "text/xml; charset=utf-8" });
        res.end(`<?xml version="1.0" encoding="UTF-8"?>${xml}`);
      };

      if (host === "A" && req.method === "PROPFIND" && req.url === "/") {
        return send207(
          `<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/1234/principal/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`
        );
      }
      if (host === "A" && req.method === "PROPFIND" && req.url === "/1234/principal/") {
        // inny styl prefiksow niz wyzej - parser ma byc na to obojetny
        return send207(
          `<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/1234/principal/</d:href><d:propstat><d:prop><cal:calendar-home-set><d:href>${homeOrigin}/1234/calendars/</d:href></cal:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`
        );
      }
      if (host === "B" && req.method === "PROPFIND" && req.url === "/1234/calendars/") {
        const items = [
          `<response><href>/1234/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>`,
          `<response><href>/1234/calendars/inbox/</href><propstat><prop><resourcetype><collection/><schedule-inbox xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response>`,
        ];
        for (const [href, c] of calendars) {
          const privs = c.ro
            ? `<privilege><read/></privilege>`
            : `<privilege><read/></privilege><privilege><write/></privilege>`;
          items.push(
            `<response><href>${href}</href><propstat><prop><displayname>${c.name}</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype><supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav">${c.comps
              .map((n) => `<comp name="${n}"/>`)
              .join("")}</supported-calendar-component-set><calendar-color xmlns="http://apple.com/ns/ical/">${c.color}</calendar-color><current-user-privilege-set>${privs}</current-user-privilege-set></prop><status>HTTP/1.1 200 OK</status></propstat><propstat><prop><getctag/></prop><status>HTTP/1.1 404 Not Found</status></propstat></response>`
          );
        }
        return send207(`<multistatus xmlns="DAV:">${items.join("")}</multistatus>`);
      }
      if (host === "B" && req.method === "MKCALENDAR") {
        const name = /<d:displayname>([^<]*)<\/d:displayname>/.exec(body)?.[1] || "?";
        calendars.set(req.url, { name, color: "#6090E0FF", comps: ["VEVENT"], ro: false });
        res.writeHead(201);
        return res.end();
      }
      if (host === "B" && req.method === "PUT") {
        const calHref = req.url.replace(/[^/]+$/, "");
        if (calendars.get(calHref)?.ro) {
          res.writeHead(403);
          return res.end();
        }
        const existed = resources.has(req.url);
        resources.set(req.url, body);
        res.writeHead(existed ? 204 : 201, { ETag: `"${body.length}"` });
        return res.end();
      }
      if (host === "B" && req.method === "DELETE") {
        const existed = resources.delete(req.url);
        res.writeHead(existed ? 204 : 404);
        return res.end();
      }
      res.writeHead(400);
      res.end();
    });
  };

  const a = http.createServer(handler("A"));
  const b = http.createServer(handler("B"));
  return new Promise((resolve) => {
    a.listen(0, "127.0.0.1", () => {
      b.listen(0, "127.0.0.1", () => {
        homeOrigin = `http://127.0.0.1:${b.address().port}`;
        resolve({
          url: `http://127.0.0.1:${a.address().port}/`,
          homeOrigin,
          resources,
          calendars,
          log,
          close: () => Promise.all([new Promise((r) => a.close(r)), new Promise((r) => b.close(r))]),
        });
      });
    });
  });
}

// ---------- dane testowe ----------
const sylwester = db.prepare("INSERT INTO users (username, display_name, role) VALUES ('s', 'Sylwester', 'user')").run().lastInsertRowid;
const nikodem = db.prepare("INSERT INTO users (username, display_name, role) VALUES ('n', 'Nikodem', 'user')").run().lastInsertRowid;
const nicheId = db.prepare("INSERT INTO niches (name, slug) VALUES ('Fryzjerzy', 'fryzjerzy')").run().lastInsertRowid;

function addLead(fields) {
  const row = { company_name: "Firma", city: "", phone: "", caller: "", google_term: "", google_term_by: "", ...fields };
  return db
    .prepare(
      `INSERT INTO leads (niche_id, company_name, city, phone, caller, google_term, google_term_by)
       VALUES (@niche_id, @company_name, @city, @phone, @caller, @google_term, @google_term_by)`
    )
    .run({ ...row, niche_id: nicheId }).lastInsertRowid;
}

function futureDay(days) {
  const today = sync.warsawNow().slice(0, 10);
  return ics.addMinutes(`${today}T00:00`, days * 24 * 60).slice(0, 10);
}

// ---------- ICS ----------
test("ics: strefa Warszawy, skladanie dlugich linii po bajtach UTF-8, escape", () => {
  const ev = ics.buildMeetEvent(
    {
      id: 7,
      company_name: "Salon Fryzjerski „Żaneta”; strzyżenie, koloryzacja i pielęgnacja włosów — Piotrków Trybunalski",
      city: "Piotrków Trybunalski",
      phone: "600100200",
      niche_name: "Fryzjerzy",
      google_term: "2026-11-10T23:45",
    },
    { userId: 3, ownerName: "Sylwester", durationMin: 30, alarmMin: 15, appUrl: "https://cc.example.pl" }
  );
  assert.match(ev.ics, /DTSTART;TZID=Europe\/Warsaw:20261110T234500\r\n/);
  assert.match(ev.ics, /DTEND;TZID=Europe\/Warsaw:20261111T001500\r\n/); // przez polnoc
  assert.match(ev.ics, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Warsaw/);
  assert.match(ev.ics, /TRIGGER:-PT15M/);
  assert.equal(ev.uid, "coldcall-meet-7-u3@mmates");
  for (const line of ev.ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, `za dluga linia: ${line}`);
  const unfolded = ev.ics.replace(/\r\n /g, "");
  assert.match(unfolded, /SUMMARY:Google Meet · Salon Fryzjerski „Żaneta”\\; strzyżenie\\, koloryzacja/);
  assert.match(unfolded, /Telefon: \+48 600 100 200\\nMiasto: Piotrków Trybunalski/);
  assert.match(unfolded, /URL;VALUE=URI:https:\/\/cc\.example\.pl\/script\.html\?leadId=7/);
  // ten sam Meet = ten sam hash (DTSTAMP sie nie liczy), inna godzina = inny
  const again = ics.buildMeetEvent({ id: 7, company_name: "X", google_term: "2026-11-10T10:00" }, { userId: 3, durationMin: 30, alarmMin: -1 });
  const same = ics.buildMeetEvent({ id: 7, company_name: "X", google_term: "2026-11-10T10:00" }, { userId: 3, durationMin: 30, alarmMin: -1 });
  const moved = ics.buildMeetEvent({ id: 7, company_name: "X", google_term: "2026-11-10T11:00" }, { userId: 3, durationMin: 30, alarmMin: -1 });
  assert.equal(again.hash, same.hash);
  assert.notEqual(again.hash, moved.hash);
  assert.doesNotMatch(again.ics, /VALARM/);
});

test("haslo do aplikacji: kazdy zapis -> format Apple abcd-efgh-ijkl-mnop", () => {
  assert.equal(sync.normalizeAppPassword("abcd-efgh-ijkl-mnop"), "abcd-efgh-ijkl-mnop");
  assert.equal(sync.normalizeAppPassword(" abcd efgh ijkl mnop "), "abcd-efgh-ijkl-mnop");
  assert.equal(sync.normalizeAppPassword("ABCDEFGHIJKLMNOP"), "abcd-efgh-ijkl-mnop");
  assert.equal(sync.normalizeAppPassword("zwykle haslo 123"), "zwykle haslo 123"); // nie zgadujemy
});

test("caldav: parser XML jest obojetny na prefiksy i encje", () => {
  const ms = caldav.parseMultistatus(
    `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/a%20b/</D:href><D:propstat><D:prop><D:displayname>A &amp; B</D:displayname></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat><D:propstat><D:prop><D:getctag/></D:prop><D:status>HTTP/1.1 404 Not Found</D:status></D:propstat></D:response></D:multistatus>`
  );
  assert.equal(ms.length, 1);
  assert.equal(ms[0].href, "/a%20b/");
  assert.deepEqual(ms[0].props.children.map((c) => c.name), ["displayname"]);
  assert.equal(ms[0].props.children[0].text, "A & B");
});

test("caldav: discover jak w iCloud (dwa hosty), filtr kalendarzy, zle haslo = 401", async () => {
  const mock = await startMockICloud();
  try {
    const found = await caldav.discover({ username: USER, password: PASS, serverUrl: mock.url });
    assert.equal(found.homeUrl, `${mock.homeOrigin}/1234/calendars/`);
    assert.deepEqual(
      found.calendars.map((c) => [c.name, c.color]),
      [
        ["Dom", "#ff2968"],
        ["Praca & spotkania", "#1badf8"],
      ]
    );
    await assert.rejects(caldav.discover({ username: USER, password: "zle", serverUrl: mock.url }), (err) => err.code === "auth");
  } finally {
    await mock.close();
  }
});

test("sync: parowanie, nowy Meet, przesuniecie, wyczyszczenie, skasowanie leada", async () => {
  const mock = await startMockICloud();
  try {
    const tomorrow = futureDay(1);
    const mine = addLead({ company_name: "Barber Bros", phone: "600100200", google_term: `${tomorrow}T14:00`, google_term_by: "Sylwester" });
    const nikodems = addLead({ company_name: "Salon Ewa", caller: "Nikodem", google_term: `${tomorrow}T15:00` });
    const past = addLead({ company_name: "Stary Meet", caller: "Sylwester", google_term: "2020-01-01T10:00" });
    addLead({ company_name: "Bez terminu", caller: "Sylwester" });
    addLead({ company_name: "Smieci z importu", caller: "Sylwester", google_term: "12:00 poniedzialek" });

    const { calendars } = await sync.connect(sylwester, { username: USER, password: ` ${PASS} `, appUrl: "https://cc.example.pl/x", serverUrl: mock.url });
    assert.equal(calendars.length, 2);
    const stored = db.prepare("SELECT * FROM calendar_accounts WHERE user_id = ?").get(sylwester);
    assert.notEqual(stored.secret, PASS); // zaszyfrowane
    assert.doesNotMatch(stored.secret, /abcd/);
    assert.equal(stored.app_url, "https://cc.example.pl");

    const home = calendars.find((c) => c.name === "Dom");
    const { account, result } = await sync.chooseCalendar(sylwester, { url: home.url });
    assert.equal(account.calendarName, "Dom");
    assert.equal(result.created, 1); // tylko jego przyszly Meet: bez cudzego, przeszlego i smieci
    assert.deepEqual([...mock.resources.keys()], [`/1234/calendars/home/coldcall-meet-${mine}-u${sylwester}.ics`]);
    const body = [...mock.resources.values()][0];
    assert.match(body, new RegExp(`DTSTART;TZID=Europe/Warsaw:${tomorrow.replace(/-/g, "")}T140000`));
    assert.match(body.replace(/\r\n /g, ""), /Lead w appce: https:\/\/cc\.example\.pl\/script\.html/);

    // drugi przebieg bez zmian = zero requestow do iCloud
    const before = mock.log.length;
    await sync.syncAll();
    assert.equal(mock.log.length, before);

    // przesuniecie terminu -> ten sam adres, nowa godzina
    db.prepare("UPDATE leads SET google_term = ? WHERE id = ?").run(`${tomorrow}T16:30`, mine);
    let { results } = await sync.syncAll();
    assert.equal(results[0].updated, 1);
    assert.equal(mock.resources.size, 1);
    assert.match([...mock.resources.values()][0], /T163000/);

    // zakres "wszystkie" -> dochodzi Meet Nikodema, przeszly dalej nie
    await sync.updateSettings(sylwester, { scope: "all", alarmMin: -1 }, "");
    assert.equal(mock.resources.size, 2);
    assert.ok(!mock.resources.has(`/1234/calendars/home/coldcall-meet-${past}-u${sylwester}.ics`));
    assert.doesNotMatch([...mock.resources.values()][0], /VALARM/);
    await sync.updateSettings(sylwester, { scope: "mine" }, "");
    assert.equal(mock.resources.size, 1);
    assert.ok(!mock.resources.has(`/1234/calendars/home/coldcall-meet-${nikodems}-u${sylwester}.ics`));

    // flush po zmianie w UI mowi, gdzie Meet jest
    const flushed = await sync.flushForLead(mine);
    assert.deepEqual(flushed.inCalendars.map((r) => r.name), ["Sylwester"]);

    // wyczyszczony termin -> wydarzenie znika
    db.prepare("UPDATE leads SET google_term = '' WHERE id = ?").run(mine);
    ({ results } = await sync.syncAll());
    assert.equal(results[0].deleted, 1);
    assert.equal(mock.resources.size, 0);

    // skasowany lead (bez FK w calendar_events) -> wydarzenie tez znika
    db.prepare("UPDATE leads SET google_term = ? WHERE id = ?").run(`${tomorrow}T09:00`, mine);
    await sync.syncAll();
    assert.equal(mock.resources.size, 1);
    db.prepare("DELETE FROM leads WHERE id = ?").run(mine);
    await sync.syncAll();
    assert.equal(mock.resources.size, 0);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM calendar_events").get().c, 0);
  } finally {
    await mock.close();
  }
});

test("sync: nowy kalendarz (MKCALENDAR), test, zmiana kalendarza, haslo uniewaznione, rozlaczenie", async () => {
  const mock = await startMockICloud();
  try {
    const day = futureDay(2);
    const lead = addLead({ company_name: "Studio K", caller: "Nikodem", google_term: `${day}T12:00` });
    await sync.connect(nikodem, { username: USER, password: PASS, serverUrl: mock.url });
    const { account } = await sync.chooseCalendar(nikodem, { createName: "Cold Call — Meety", color: "#E0935C" });
    assert.equal(account.calendarName, "Cold Call — Meety");
    const created = [...mock.calendars.entries()].find(([, c]) => c.name === "Cold Call — Meety");
    assert.ok(created, "MKCALENDAR nie utworzyl kalendarza");
    assert.ok(mock.resources.has(`${created[0]}coldcall-meet-${lead}-u${nikodem}.ics`));

    const t = await sync.sendTestEvent(nikodem);
    assert.ok(t.account.hasTest);
    assert.ok(mock.resources.has(`${created[0]}coldcall-test-u${nikodem}.ics`));
    await sync.removeTestEvent(nikodem);
    assert.ok(!mock.resources.has(`${created[0]}coldcall-test-u${nikodem}.ics`));

    // przeniesienie do innego kalendarza: znika ze starego, pojawia sie w nowym
    const { calendars } = await sync.connect(nikodem, { username: USER, password: PASS, serverUrl: mock.url });
    assert.ok(calendars.some((c) => c.name === "Cold Call — Meety")); // to samo konto - kalendarz zachowany
    await sync.chooseCalendar(nikodem, { url: `${mock.homeOrigin}/1234/calendars/work/` });
    assert.ok(!mock.resources.has(`${created[0]}coldcall-meet-${lead}-u${nikodem}.ics`));
    assert.ok(mock.resources.has(`/1234/calendars/work/coldcall-meet-${lead}-u${nikodem}.ics`));

    // kalendarz tylko do odczytu nie przejdzie wyboru (nie ma go nawet na liscie)
    await assert.rejects(sync.chooseCalendar(nikodem, { url: `${mock.homeOrigin}/1234/calendars/shared/` }), /Nie znaleziono/);

    // uniewaznione haslo -> auth_error, automatyczny sync to konto omija, reczny probuje
    db.prepare("UPDATE calendar_accounts SET secret = ? WHERE user_id = ?").run(require("./calendarSecret").encrypt("stare-haslo"), nikodem);
    db.prepare("UPDATE leads SET google_term = ? WHERE id = ?").run(`${day}T13:00`, lead);
    await sync.syncAll();
    assert.equal(sync.accountFor(nikodem).status, "auth_error");
    const requests = mock.log.length;
    await sync.syncAll();
    assert.equal(mock.log.length, requests);
    const manual = await sync.syncNow(nikodem);
    assert.match(manual.result.error, /hasła DLA APLIKACJI/);

    // ponowne polaczenie naprawia i dosyla zmiane
    await sync.connect(nikodem, { username: USER, password: PASS, serverUrl: mock.url });
    await sync.syncNow(nikodem);
    assert.equal(sync.accountFor(nikodem).status, "ok");
    assert.match(mock.resources.get(`/1234/calendars/work/coldcall-meet-${lead}-u${nikodem}.ics`), /T130000/);

    // Nikodem ma dwa nadchodzace Meety: ten z tego testu i "Salon Ewa" z poprzedniego
    const upcoming = sync.publicAccount(sync.accountFor(nikodem)).upcoming;
    assert.equal(upcoming, 2);
    const out = await sync.disconnect(nikodem, { removeEvents: true });
    assert.equal(out.removed, upcoming);
    assert.equal(mock.resources.size, 0);
    assert.equal(sync.accountFor(nikodem), null);
    assert.ok(!mock.resources.has(`/1234/calendars/work/coldcall-meet-${lead}-u${nikodem}.ics`));
  } finally {
    await mock.close();
  }
});
