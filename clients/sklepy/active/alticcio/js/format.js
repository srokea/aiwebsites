// Daty jako napisy „RRRR-MM-DD” liczone w czasie Warszawy, niezależnie od strefy urządzenia.
// Obiekty Date tworzymy w UTC wyłącznie do arytmetyki kalendarzowej.

export const TIMEZONE = 'Europe/Warsaw';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dzisiejsza data w Warszawie. */
export const todayInWarsaw = (now = new Date()) => ymd.format(now);

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** ISO: 1 = poniedziałek … 7 = niedziela. */
export function isoWeekday(iso) {
  return ((parseDate(iso).getUTCDay() + 6) % 7) + 1;
}

const summaryFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** „śr., 16 września” */
export const formatShortDate = (iso) => summaryFmt.format(parseDate(iso));
/** „środa, 16 września 2026” */
export const formatLongDate = (iso) => longFmt.format(parseDate(iso));
/** „wrzesień 2026” */
export const formatMonth = (year, month) => monthFmt.format(new Date(Date.UTC(year, month, 1)));

/** 1 osoba · 2–4 osoby · 5 osób · 12–14 osób · 22 osoby */
export function formatPeople(n) {
  if (n === 1) return '1 osoba';
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} osoby`;
  return `${n} osób`;
}

/** 90 → „1,5 godz.”, 120 → „2 godz.” */
export function formatDuration(minutes) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : String(h).replace('.', ',')} godz.`;
}
