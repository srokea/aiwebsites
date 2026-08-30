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
  { value: "brak_wlasciciela", label: "B. Właściciela", color: "#7c8fa6", resolved: false },
  { value: "nie", label: "Nie", color: "#e06050", resolved: true },
  { value: "strona", label: "Strona", color: "#e07ab3", resolved: true, autoCall: true },
  { value: "zamkniete", label: "Tym. Zamk.", color: "#b06a3a", resolved: true, autoCall: true },
  { value: "oczekiwanie", label: "Oczekiwanie", color: "#c0a050", resolved: false, highlight: true },
  // #2026-08 - inne niz "Oczekiwanie": tam CZEKAMY na telefon od nich, tu MY zobowiazalismy sie
  // oddzwonic - rozroznienie wprost od uzytkownika (Sylwester), zeby nie mylic kto ma zadzwonic
  { value: "oddzwon_my", label: "Oddzwonić (my)", color: "#4fa8d8", resolved: false, highlight: true },
  { value: "my_dzwonimy", label: "Poczta", color: "#50b8c0", resolved: false, highlight: true },
  { value: "sms", label: "SMS", color: "#a066e0", resolved: true },
  { value: "mail", label: "Mail", color: "#6ec6ff", resolved: true },
  { value: "google_meet", label: "Google Meet", color: "#6090e0", resolved: true, highlight: true },
  // etap miedzy odbytym spotkaniem a podpisem - lead juz po Meecie, jeszcze nie klient
  { value: "closing", label: "Closing", color: "#2ec9a0", resolved: true, highlight: true },
  { value: "dopiete", label: "Dopięte", color: "#5cb85c", resolved: true, highlight: true },
];

// Kolejnosc na liscie zbiorczej (kropki) na stronie glownej - inna niz w dropdownie, bo tam
// chcemy najpierw to, co najciekawsze biznesowo (te same pierwsze 6 co na wykresie kolowym,
// patrz INTERESTED_DONUT_ORDER), a reszta (mniej istotne/rzadsze statusy) na koncu listy.
const INTERESTED_STATS_ORDER = ["dopiete", "closing", "google_meet", "oczekiwanie", "oddzwon_my", "my_dzwonimy", "nie", "nieruszone", "strona", "zamkniete", "brak_wlasciciela", "sms", "mail"];

// Wykres kolowy na stronie glownej ma pokazywac tylko te kluczowe statusy (i w tej kolejnosci) -
// reszta (Strona, Zamkniete, SMS, Mail, Brak wlasciciela) widoczna jest tylko w legendzie z kropkami obok.
const INTERESTED_DONUT_ORDER = ["dopiete", "closing", "google_meet", "oczekiwanie", "oddzwon_my", "my_dzwonimy", "nie", "nieruszone"];

const ANSWERED_OPTIONS = [
  { value: "Nie", label: "Nie", color: "#e06050" },
  { value: "Tak", label: "Tak", color: "#5cb85c" },
];

const CALLERS = ["Sylwester", "Nikodem"];
const CALLER_COLORS = { Sylwester: "#6090e0", Nikodem: "#e0935c" };

const PLATFORM_TAGS = ["instagram", "facebook", "booksy", "youtube", "tiktok"];
const PLATFORM_META = {
  instagram: { label: "IG", name: "Instagram", color: "#E1306C" },
  facebook: { label: "f", name: "Facebook", color: "#1877F2" },
  booksy: { label: "B", name: "Booksy", color: "#17BEBB" },
  youtube: { label: "YT", name: "YouTube", color: "#FF3B3B" },
  // czarne tlo, nie kolor marki (#25F4EE) - tak wyglada oficjalne logo TikToka: czarna nutka
  // z cyjanowym/rozowym "cieniem" wystajacym z lewej/prawej (patrz PLATFORM_ICONS.tiktok w api.js)
  tiktok: { label: "TT", name: "TikTok", color: "#000000" },
};

// label = skrocony tekst pokazywany w kolumnie/dropdownie "Strona" (zeby zajmowala mniej
// miejsca w tabeli); value zostaje pelnym slowem "Tak"/"Nie"/"Booksy" - to na nim opiera sie
// reszta logiki (STATS_ELIGIBLE_SQL, tag_booksy przy wyborze Booksy itd.), wiec go NIE skracamy.
const WEBSITE_STATUS_OPTIONS = [
  { value: "Tak", label: "y", color: "#5cb85c" },
  { value: "Booksy", label: "b", color: "#17BEBB" },
  { value: "Nie", label: "n", color: "#e06050" },
];

// Jakosc leada: dropdown 0-6 zamiast wolnego tekstu. 0 = tragiczny lead - wykluczony ze
// statystyk (patrz STATS_ELIGIBLE_SQL w leadStatus.js), zeby nie zawyzal "do zrobienia".
// 5 = ma Booksy (umowna konwencja Sylwestra/Nikodema, bez dodatkowej logiki po stronie kodu).
// 6 = ma wlasna strone - to zastapilo dawna kolumne "Strona" (has_social='Tak'), wiec TEZ
// wyklucza leada ze statystyk (patrz STATS_ELIGIBLE_SQL).
const QUALITY_OPTIONS = [
  { value: "0", label: "0", color: "#5a5a5a" },
  { value: "1", label: "1", color: "#e06050" },
  { value: "2", label: "2", color: "#e0935c" },
  { value: "3", label: "3", color: "#c0a050" },
  { value: "4", label: "4", color: "#6ec6ff" },
  { value: "5", label: "5", color: "#6090e0" },
  { value: "6", label: "6", color: "#5cb85c" },
];

// #14 - postep budowy strony klienta, ustawiany recznie klikiem w kolko przy pozycji w
// panelu "Najblizsze Google Meety" (patrz index.js). W bazie leads.site_progress = value.
// Dopisanie etapu tutaj wystarczy - front i walidacja API biora liste stad.
const SITE_PROGRESS_OPTIONS = [
  { value: 0, label: "Wcale", pct: 0, color: "#5a5a5a" },
  { value: 1, label: "W połowie", pct: 50, color: "#c0a050" },
  { value: 2, label: "Prawie skończona", pct: 80, color: "#6ec6ff" },
  { value: 3, label: "Skończona", pct: 100, color: "#5cb85c" },
];

// #10 - gotowiec do skopiowania przy przypomnieniu o jutrzejszym Meecie. {godzina} podstawia
// sie z terminu leada; zmiana tresci = edycja tej jednej linijki.
const SMS_CONFIRM_TEMPLATE =
  "Dzień dobry, potwierdzam nasze spotkanie online jutro o {godzina}. Link do spotkania wyślę chwilę przed rozpoczęciem. Do usłyszenia ☺️";

// #6 - kategorie wpisow w Historii transakcji. sign = kierunek dla bilansu.
const TRANSACTION_CATEGORIES = [
  { value: "przychod", label: "Przychód", sign: 1, color: "#5cb85c" },
  { value: "wydatek", label: "Wydatek", sign: -1, color: "#e06050" },
];

const NICHE_COLORS = ["#6090e0", "#5cb85c", "#e06050", "#c0a050", "#a066e0", "#0e86d4", "#e0935c", "#e15a97"];

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
  QUALITY_OPTIONS,
  SITE_PROGRESS_OPTIONS,
  SMS_CONFIRM_TEMPLATE,
  TRANSACTION_CATEGORIES,
  NICHE_COLORS,
  DAILY_GOAL,
  PRICING,
  EXPENSES,
};
