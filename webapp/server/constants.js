// Jedyne zrodlo prawdy dla list wyboru i kolorow. Frontend pobiera to przez /api/meta,
// zeby nie duplikowac tych samych wartosci po obu stronach.

// Kolejnosc ma znaczenie: tak wygladaja opcje w dropdownie i tak sortuje sie kolumna
// "Zainteresowany?" (od najzimniejszego do najcieplejszego leada).
// `highlight: true` => caly wiersz w tabeli dostaje podswietlenie w tym kolorze.
// `resolved: false` => sprawa niezakonczona, lead NIE liczy sie jako zrobiony (patrz leadStatus.js).
// `autoCall: true` => status sam w sobie liczy sie jako "zrobiony", nawet bez ustawionego
// dzwoniacego/Odebral - bo to ustalenia z researchu (widac strone/zamkniete na Google), a nie
// koniecznie z rozmowy telefonicznej (patrz leadStatus.js).
// "nieruszone" to wartosc domyslna dla kazdego nowego leada (import i recznie dodane) -
// odrozniona od swiadomego "Nie", zeby swiezy, nietkniety lead nie wygladal jak odrzucony.
const INTERESTED_OPTIONS = [
  { value: "nieruszone", label: "Nieruszone", color: "#5a5a5a", resolved: false },
  { value: "brak_wlasciciela", label: "Brak właściciela", color: "#7c8fa6", resolved: false },
  { value: "nie", label: "Nie", color: "#e06050", resolved: true },
  { value: "strona", label: "Strona", color: "#e07ab3", resolved: true, autoCall: true },
  { value: "zamkniete", label: "Tymczasowo zamknięte", color: "#b06a3a", resolved: true, autoCall: true },
  { value: "oczekiwanie", label: "Oczekiwanie", color: "#c0a050", resolved: false, highlight: true },
  { value: "my_dzwonimy", label: "Oddzwonić - Poczta", color: "#50b8c0", resolved: false, highlight: true },
  { value: "sms", label: "SMS", color: "#a066e0", resolved: true },
  { value: "mail", label: "Mail", color: "#6ec6ff", resolved: true },
  { value: "google_meet", label: "Google Meet", color: "#6090e0", resolved: true, highlight: true },
  { value: "dopiete", label: "Dopięte", color: "#5cb85c", resolved: true, highlight: true },
];

// Kolejnosc na liscie zbiorczej (kropki) na stronie glownej - inna niz w dropdownie, bo tam
// chcemy najpierw to, co najciekawsze biznesowo (te same pierwsze 6 co na wykresie kolowym,
// patrz INTERESTED_DONUT_ORDER), a reszta (mniej istotne/rzadsze statusy) na koncu listy.
const INTERESTED_STATS_ORDER = ["dopiete", "google_meet", "oczekiwanie", "my_dzwonimy", "nie", "nieruszone", "strona", "zamkniete", "brak_wlasciciela", "sms", "mail"];

// Wykres kolowy na stronie glownej ma pokazywac tylko te kluczowe statusy (i w tej kolejnosci) -
// reszta (Strona, Zamkniete, SMS, Mail, Brak wlasciciela) widoczna jest tylko w legendzie z kropkami obok.
const INTERESTED_DONUT_ORDER = ["dopiete", "google_meet", "oczekiwanie", "my_dzwonimy", "nie", "nieruszone"];

const ANSWERED_OPTIONS = [
  { value: "Nie", label: "Nie", color: "#e06050" },
  { value: "Tak", label: "Tak", color: "#5cb85c" },
];

const CALLERS = ["Sylwester", "Nikodem"];
const CALLER_COLORS = { Sylwester: "#6090e0", Nikodem: "#e0935c" };

const PLATFORM_TAGS = ["instagram", "facebook", "booksy", "youtube"];
const PLATFORM_META = {
  instagram: { label: "IG", name: "Instagram", color: "#E1306C" },
  facebook: { label: "f", name: "Facebook", color: "#1877F2" },
  booksy: { label: "B", name: "Booksy", color: "#17BEBB" },
  youtube: { label: "YT", name: "YouTube", color: "#FF3B3B" },
};

const WEBSITE_STATUS_OPTIONS = [
  { value: "Tak", label: "Tak", color: "#5cb85c" },
  { value: "Booksy", label: "Booksy", color: "#17BEBB" },
  { value: "Nie", label: "Nie", color: "#e06050" },
];

const NICHE_COLORS = ["#6090e0", "#5cb85c", "#e06050", "#c0a050", "#a066e0", "#50b8c0", "#e0935c", "#e15a97"];

const DAILY_GOAL = 20;

// Cennik: tyle bierzemy za kazdego "Dopietego" klienta - jednorazowo za wdrozenie
// i miesiecznie za utrzymanie/opieke. Uzywane do panelu zarobkow na stronie glownej.
const PRICING = { oneTime: 300, monthly: 100 };

// Stale koszty miesieczne (np. subskrypcje narzedzi) - kazdy wpis liczy sie od swojej daty
// "from" (dzien miesiaca = dzien odnowienia). Dodanie/zmiana/koniec kosztu = edycja tej listy,
// nic wiecej nie trzeba ruszac (patrz panel Kasy / /api/stats). "to" opcjonalne - koniec kosztu
// (np. zmiana planu), brak = koszt nadal aktywny.
// UWAGA: data "from" ponizej jest przyblizona (~poczatek pierwszego miesiaca) - popraw na
// faktyczna date startu subskrypcji, jesli chcesz dokladne wyliczenie w kafelku "Netto".
const EXPENSES = [{ name: "Claude Code", amount: 75, from: "2026-07-01" }];

module.exports = {
  INTERESTED_OPTIONS,
  INTERESTED_STATS_ORDER,
  INTERESTED_DONUT_ORDER,
  ANSWERED_OPTIONS,
  CALLERS,
  CALLER_COLORS,
  PLATFORM_TAGS,
  PLATFORM_META,
  WEBSITE_STATUS_OPTIONS,
  NICHE_COLORS,
  DAILY_GOAL,
  PRICING,
  EXPENSES,
};
