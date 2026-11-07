// Minimalny klient CalDAV pod iCloud (dziala tez z innymi serwerami CalDAV, ale UI parowania
// zna tylko iCloud). Bez zaleznosci: fetch z Node 22 + maly parser XML ponizej - odpowiedzi
// DAV (multistatus) to prosty XML, a pelna biblioteka bylaby tu armata na wroble.
//
// Przeplyw iCloud (RFC 4791 / 5397):
//   1. PROPFIND https://caldav.icloud.com/            -> current-user-principal ("/123/principal/")
//   2. PROPFIND <principal>                            -> calendar-home-set (INNY host: pNN-caldav.icloud.com)
//   3. PROPFIND <home> Depth:1                         -> lista kalendarzy
//   4. PUT <kalendarz>/<uid>.ics / DELETE ...          -> wydarzenia
// Logowanie: Apple ID + haslo DLA APLIKACJI (account.apple.com -> Hasla do aplikacji). Zwykle
// haslo do Apple ID przy wlaczonym 2FA nie przejdzie - iCloud odda 401.

const crypto = require("crypto");

const ICLOUD_URL = "https://caldav.icloud.com/";
const USER_AGENT = "MMates-ColdCall/1.0 (CalDAV)";
const TIMEOUT_MS = 20000;

class CalDavError extends Error {
  // code: 'auth' (zle dane logowania) | 'forbidden' (brak prawa zapisu) | 'network' | 'protocol'
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status || 0;
  }
}

// ---------- mini parser XML ----------
// Zwraca drzewo { name, attrs, children, text }. Przestrzenie nazw sa ignorowane (zostaje sama
// nazwa lokalna: "d:href" i "href" to to samo) - w odpowiedziach DAV nazwy, ktorych uzywamy,
// sa jednoznaczne, a serwery roznie dobieraja prefiksy (iCloud: domyslny ns, inni: "d:").
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function localName(qname) {
  const i = qname.indexOf(":");
  return i >= 0 ? qname.slice(i + 1) : qname;
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) attrs[localName(m[1])] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}

function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s>/]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.text += m[1];
    } else if (m[3] !== undefined) {
      const closing = m[2] === "/";
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const node = { name: localName(m[3]), attrs: parseAttrs(m[4] || ""), children: [], text: "" };
      top.children.push(node);
      if (m[5] !== "/") stack.push(node);
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6]);
    }
  }
  return root;
}

function findAll(node, name, out = []) {
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

function find(node, name) {
  for (const child of node.children) {
    if (child.name === name) return child;
    const deep = find(child, name);
    if (deep) return deep;
  }
  return null;
}

const textOf = (node) => (node ? node.text.trim() : "");

// <current-user-principal><href>/123/principal/</href></current-user-principal> -> "/123/principal/"
function hrefInside(props, name) {
  const node = find(props, name);
  return node ? textOf(find(node, "href")) : "";
}

// multistatus -> [{ href, props: <wezel prop z propstat 200> }]
function parseMultistatus(xml) {
  const root = parseXml(xml);
  return findAll(root, "response").map((r) => {
    const href = textOf(r.children.find((c) => c.name === "href"));
    const okProps = r.children
      .filter((c) => c.name === "propstat")
      .filter((ps) => /\s2\d\d\s/.test(` ${textOf(ps.children.find((c) => c.name === "status"))} `))
      .map((ps) => ps.children.find((c) => c.name === "prop"))
      .filter(Boolean);
    // jedna "wirtualna" galaz prop z dziecmi ze wszystkich udanych propstatow
    return { href, props: { name: "prop", attrs: {}, text: "", children: okProps.flatMap((p) => p.children) } };
  });
}

// ---------- HTTP ----------
function basicAuth(username, password) {
  return "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

const XML_TYPE = "text/xml; charset=utf-8";

// Przekierowania obslugujemy recznie: fetch przy przejsciu na inny host zdejmuje naglowek
// Authorization (slusznie, ale iCloud lubi przerzucac miedzy swoimi hostami).
async function davRequest(url, { method, auth, depth, body, contentType, headers = {} }) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    let res;
    try {
      res = await fetch(current, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: auth,
          "User-Agent": USER_AGENT,
          ...(depth !== undefined ? { Depth: String(depth) } : {}),
          ...(body !== undefined ? { "Content-Type": contentType || XML_TYPE } : {}),
          ...headers,
        },
        body,
      });
    } catch (err) {
      const reason = err.name === "TimeoutError" ? "przekroczony czas odpowiedzi" : err.cause?.code || err.message;
      throw new CalDavError(`Brak połączenia z serwerem kalendarza (${reason})`, "network");
    }
    const location = res.headers.get("location");
    if ([301, 302, 307, 308].includes(res.status) && location) {
      const next = new URL(location, current);
      if (next.protocol !== "https:" && new URL(current).protocol === "https:") {
        throw new CalDavError("Serwer kalendarza przekierował na nieszyfrowany adres", "protocol", res.status);
      }
      current = next.href;
      continue;
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, url: current };
  }
  throw new CalDavError("Za dużo przekierowań z serwera kalendarza", "protocol");
}

function failFor(res, what) {
  if (res.status === 401) {
    return new CalDavError(
      "iCloud odrzucił logowanie. Sprawdź Apple ID i użyj hasła DLA APLIKACJI (nie zwykłego hasła do Apple ID).",
      "auth",
      401
    );
  }
  if (res.status === 403) return new CalDavError(`Brak uprawnień (${what})`, "forbidden", 403);
  return new CalDavError(`Serwer kalendarza odpowiedział ${res.status} (${what})`, "protocol", res.status);
}

async function propfind(url, auth, depth, body, what) {
  const res = await davRequest(url, { method: "PROPFIND", auth, depth, body });
  if (res.status !== 207) throw failFor(res, what);
  return { url: res.url, responses: parseMultistatus(res.text) };
}

const ensureSlash = (u) => (u.endsWith("/") ? u : `${u}/`);

// "#FF2968FF" (iCloud, z kanalem alfa) -> "#ff2968"
function normalizeColor(raw) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(raw || "").trim());
  return m ? `#${m[1].toLowerCase()}` : "";
}

const NS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"';

async function listCalendars({ auth, homeUrl }) {
  const { url, responses } = await propfind(
    homeUrl,
    auth,
    1,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>`,
    "lista kalendarzy"
  );
  const calendars = [];
  for (const r of responses) {
    const resourcetype = find(r.props, "resourcetype");
    if (!resourcetype || !resourcetype.children.some((c) => c.name === "calendar")) continue;
    // kalendarze iCloud tylko z zadaniami (Przypomnienia) maja wylacznie VTODO - tam Meeta nie wstawimy
    const comps = findAll(r.props, "comp").map((c) => String(c.attrs.name || "").toUpperCase());
    if (comps.length && !comps.includes("VEVENT")) continue;
    const privSet = find(r.props, "current-user-privilege-set");
    const privs = privSet ? findAll(privSet, "privilege").flatMap((p) => p.children.map((c) => c.name)) : null;
    const readOnly = privs ? !privs.some((p) => ["all", "write", "write-content", "bind"].includes(p)) : false;
    if (readOnly) continue;
    const calUrl = ensureSlash(new URL(r.href, url).href);
    if (calUrl === ensureSlash(homeUrl)) continue;
    calendars.push({
      url: calUrl,
      name: textOf(find(r.props, "displayname")) || "Kalendarz bez nazwy",
      color: normalizeColor(textOf(find(r.props, "calendar-color"))),
    });
  }
  return calendars.sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

// Apple ID + haslo -> { principalUrl, homeUrl, calendars }. Rzuca CalDavError('auth') przy zlym hasle.
async function discover({ username, password, serverUrl = ICLOUD_URL }) {
  const auth = basicAuth(username, password);
  const r1 = await propfind(
    serverUrl,
    auth,
    0,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`,
    "konto"
  );
  const principalHref = r1.responses.map((r) => hrefInside(r.props, "current-user-principal")).find(Boolean);
  if (!principalHref) throw new CalDavError("Serwer nie zwrócił konta użytkownika (current-user-principal)", "protocol");
  const principalUrl = new URL(principalHref, r1.url).href;

  const r2 = await propfind(
    principalUrl,
    auth,
    0,
    `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop><c:calendar-home-set/></d:prop></d:propfind>`,
    "katalog kalendarzy"
  );
  const homeHref = r2.responses.map((r) => hrefInside(r.props, "calendar-home-set")).find(Boolean);
  if (!homeHref) throw new CalDavError("Serwer nie zwrócił katalogu kalendarzy (calendar-home-set)", "protocol");
  const homeUrl = ensureSlash(new URL(homeHref, r2.url).href);

  const calendars = await listCalendars({ auth, homeUrl });
  return { principalUrl, homeUrl, calendars };
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Nowy kalendarz (np. "Cold Call — Meety") - osobny kalendarz latwo ukryc albo skasowac jednym
// ruchem na iPhonie, bez grzebania w prywatnych wydarzeniach.
async function createCalendar({ auth, homeUrl, name, color }) {
  const url = `${ensureSlash(homeUrl)}${crypto.randomUUID().toUpperCase()}/`;
  const colorXml = color ? `<a:calendar-color>${escapeXml(color.toUpperCase())}FF</a:calendar-color>` : "";
  const res = await davRequest(url, {
    method: "MKCALENDAR",
    auth,
    body: `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar ${NS}><d:set><d:prop><d:displayname>${escapeXml(name)}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>${colorXml}</d:prop></d:set></c:mkcalendar>`,
  });
  if (res.status !== 201 && res.status !== 200) throw failFor(res, "tworzenie kalendarza");
  return { url, name, color: normalizeColor(color) };
}

// PUT nadpisuje zasob pod tym samym adresem - celowo bez If-Match/If-None-Match: to nasze
// wlasne wydarzenia (deterministyczny adres z UID), wiec ponowne parowanie nie robi duplikatow.
async function putEvent({ auth, url, ics }) {
  const res = await davRequest(url, { method: "PUT", auth, body: ics, contentType: "text/calendar; charset=utf-8" });
  if (![200, 201, 204].includes(res.status)) throw failFor(res, "zapis wydarzenia");
  return { etag: res.headers.get("etag") || "" };
}

async function deleteEvent({ auth, url }) {
  const res = await davRequest(url, { method: "DELETE", auth });
  // 404/410 = juz go nie ma (np. ktos skasowal recznie na iPhonie) - cel osiagniety
  if (![200, 204, 404, 410].includes(res.status)) throw failFor(res, "usuwanie wydarzenia");
}

module.exports = {
  ICLOUD_URL,
  CalDavError,
  parseXml,
  parseMultistatus,
  basicAuth,
  discover,
  listCalendars,
  createCalendar,
  putEvent,
  deleteEvent,
  normalizeColor,
};
