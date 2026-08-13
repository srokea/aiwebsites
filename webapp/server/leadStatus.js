const { INTERESTED_OPTIONS } = require("./constants");

const UNRESOLVED = new Set(INTERESTED_OPTIONS.filter((o) => o.resolved === false).map((o) => o.value));
const AUTO_CALL = new Set(INTERESTED_OPTIONS.filter((o) => o.autoCall).map((o) => o.value));

// Lead liczy sie jako "zrobiony" gdy byl jakikolwiek slad kontaktu (przypisany dzwoniacy
// albo odnotowane Odebral) ORAZ sprawa jest rozstrzygnieta - status inny niz "Oczekiwanie"
// czy "Oddzwonic - Poczta", ktore z definicji czekaja na kolejny telefon.
// Wyjatek: statusy z autoCall (np. "Strona", "Tymczasowo zamkniete") licza sie same w sobie,
// bo to czesto ustalenia z researchu, a nie z rozmowy - nie warto wymagac przy nich Odebral/dzwoniacego.
function isCalled(lead) {
  if (AUTO_CALL.has(lead.interested)) return true;
  const hadContact = Boolean(lead.caller) || Boolean(lead.answered);
  return hadContact && !UNRESOLVED.has(lead.interested);
}

// Zwraca nowe called_at: zachowuje istniejacy znacznik czasu gdy status sie nie zmienil,
// stempluje "teraz" przy przejsciu na zrobiony i czysci przy powrocie do niezrobionego.
function computeCalledAt(nextLead, previousCalledAt = null) {
  const called = isCalled(nextLead);
  if (!called) return null;
  return previousCalledAt || new Date().toISOString();
}

// Zwraca nowy dopiete_at: stempluje "teraz" przy pierwszym przejsciu na "dopiete", zachowuje
// istniejacy znacznik gdy status sie nie zmienil, czysci przy wycofaniu (np. pomylka przy
// zaznaczaniu) - zeby ponowne domkniecie tego samego leada zaczynalo liczenie od nowa.
function computeDopieteAt(nextLead, previousDopieteAt = null) {
  if (nextLead.interested !== "dopiete") return null;
  return previousDopieteAt || new Date().toISOString();
}

// Leady, ktore juz maja wlasna strone (Strona = "Tak"), nie wliczaja sie do zadnych
// statystyk dzwonienia (kafelki, wykresy, paski postepu) - nie ma do kogo dzwonic z oferta,
// wiec zawyzalyby "do zrobienia" i zanizaly postep. W tabeli leadow normalnie widoczne.
// Fragment SQL do wklejenia w warunki zapytan (bezpieczny - stala, nie input uzytkownika).
const STATS_ELIGIBLE_SQL = "has_social <> 'Tak'";

// Rozklad statusow (wykres kolowy + legenda) rzadzi sie inna regula niz liczniki dzwonienia:
// pokazuje leady, do ktorych dzwonimy, ORAZ te z odnotowanym wynikiem - nawet jesli maja
// juz wlasna strone. Inaczej dopiety klient znikalby z wykresu w momencie, w ktorym
// postawimy mu strone (dostaje wtedy Strona = "Tak"), czyli dokladnie po sprzedazy.
// Leady ze strona, ktorych nikt nie ruszal, nadal sie nie licza - nie zasmiecaja wykresu.
const STATS_BREAKDOWN_SQL = `(${STATS_ELIGIBLE_SQL} OR called_at IS NOT NULL)`;

module.exports = { isCalled, computeCalledAt, computeDopieteAt, STATS_ELIGIBLE_SQL, STATS_BREAKDOWN_SQL };
