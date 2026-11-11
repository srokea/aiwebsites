// Budowanie wydarzen iCalendar (RFC 5545) dla Meetow wysylanych do iCloud (patrz calendarSync.js).
//
// google_term to lokalna "YYYY-MM-DDTHH:MM" wpisana przez czlowieka w Polsce, bez strefy - dlatego
// wydarzenie idzie z TZID=Europe/Warsaw (+ definicja strefy w VTIMEZONE), a NIE w UTC. Dzieki temu
// 14:00 zostaje 14:00 na iPhonie niezaleznie od tego, w jakiej strefie chodzi kontener serwera.

const crypto = require("crypto");

const TZID = "Europe/Warsaw";
// podbicie wersji = zmiana formatu wydarzenia -> silnik synchronizacji raz przepisze wszystkie
// juz wyslane wydarzenia (hash tresci sie zmieni), bez recznego czyszczenia kalendarzy
const FORMAT_VERSION = 1;
const PRODID = "-//MMates//Cold Call Tracker//PL";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const pad = (n) => String(n).padStart(2, "0");

function escapeText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 3.1: linia max 75 oktetow, kontynuacja zaczyna sie od spacji. Liczymy bajty UTF-8
// (polskie znaki to 2 bajty) i tniemy tylko miedzy pelnymi znakami.
function fold(line) {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts = [];
  let current = "";
  let used = 0;
  let limit = 75;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, "utf8");
    if (used + len > limit) {
      parts.push(current);
      current = "";
      used = 0;
      limit = 74; // spacja na poczatku linii kontynuacji tez jest oktetem
    }
    current += ch;
    used += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

// "2026-11-10T14:00" + 30 -> "2026-11-10T14:30" (arytmetyka na "scianie zegara", bez strefy)
function addMinutes(term, minutes) {
  const [d, t] = term.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const x = new Date(Date.UTC(y, mo - 1, da, h, mi) + minutes * 60000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

const icsLocal = (term) => `${term.replace(/[-:]/g, "")}00`; // -> "20261110T140000"

function icsUtcNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // "20261107T101500Z"
}

// numer z bazy (rozne formaty z importow) -> "+48 600 100 200" - iPhone robi z tego klikalny link
function prettyPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const local = digits.length === 11 && digits.startsWith("48") ? digits.slice(2) : digits;
  if (local.length === 9) return `+48 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  return String(raw).trim();
}

function render({ uid, summary, description, start, end, alarmMin, url }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    ...VTIMEZONE,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsUtcNow()}`,
    `DTSTART;TZID=${TZID}:${icsLocal(start)}`,
    `DTEND;TZID=${TZID}:${icsLocal(end)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (url) lines.push(`URL;VALUE=URI:${url}`);
  if (alarmMin >= 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(summary)}`,
      alarmMin === 0 ? "TRIGGER:PT0M" : `TRIGGER:-PT${alarmMin}M`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function hashOf(fields) {
  return crypto.createHash("sha1").update(JSON.stringify({ v: FORMAT_VERSION, ...fields })).digest("hex");
}

// lead: { id, company_name, city, phone, website_url, niche_name, google_term }
// opts: { userId, ownerName, durationMin, alarmMin, appUrl }
// -> { uid, fileName, ics, hash } - hash liczony z tresci (bez DTSTAMP), zeby sync wiedzial,
//    czy cokolwiek sie zmienilo i czy w ogole trzeba dzwonic do iCloud
function buildMeetEvent(lead, { userId, ownerName, durationMin, alarmMin, appUrl }) {
  // deterministyczny UID = ponowne parowanie z tym samym kalendarzem nadpisuje, zamiast dublowac
  const uid = `coldcall-meet-${lead.id}-u${userId}@mmates`;
  const fileName = `coldcall-meet-${lead.id}-u${userId}.ics`;
  const company = String(lead.company_name || "").trim();
  const summary = company ? `Google Meet · ${company}` : "Google Meet";
  const leadUrl = appUrl ? `${appUrl.replace(/\/+$/, "")}/script.html?leadId=${lead.id}` : "";
  const description = [
    lead.phone && `Telefon: ${prettyPhone(lead.phone)}`,
    lead.city && `Miasto: ${lead.city}`,
    lead.niche_name && `Nisza: ${lead.niche_name}`,
    ownerName && `Umówione przez: ${ownerName}`,
    lead.website_url && `Strona: ${lead.website_url}`,
    leadUrl && `Lead w appce: ${leadUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const fields = {
    summary,
    description,
    start: lead.google_term,
    end: addMinutes(lead.google_term, durationMin),
    alarmMin,
    url: leadUrl,
  };
  return { uid, fileName, ics: render({ uid, ...fields }), hash: hashOf(fields) };
}

// wydarzenie "sprawdz, czy dziala" z okna parowania - 15 min, za ok. 10 minut od teraz
function buildTestEvent({ userId, startTerm }) {
  const uid = `coldcall-test-u${userId}@mmates`;
  const fields = {
    summary: "Test: Cold Call Tracker ✓",
    description: "Jeśli to widzisz na iPhonie, parowanie działa. To wydarzenie możesz usunąć.",
    start: startTerm,
    end: addMinutes(startTerm, 15),
    alarmMin: -1,
    url: "",
  };
  return { uid, fileName: `coldcall-test-u${userId}.ics`, ics: render({ uid, ...fields }) };
}

module.exports = { buildMeetEvent, buildTestEvent, addMinutes, fold, escapeText, prettyPhone, TZID };
