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

// Leady, ktore juz maja wlasna strone (Strona = "Tak"), nie wliczaja sie do zadnych
// statystyk dzwonienia (kafelki, wykresy, paski postepu) - nie ma do kogo dzwonic z oferta,
// wiec zawyzalyby "do zrobienia" i zanizaly postep. W tabeli leadow normalnie widoczne.
// Fragment SQL do wklejenia w warunki zapytan (bezpieczny - stala, nie input uzytkownika).
const STATS_ELIGIBLE_SQL = "has_social <> 'Tak'";

module.exports = { isCalled, computeCalledAt, STATS_ELIGIBLE_SQL };
