// Kwota slownie po polsku na rachunek: 125050 groszy -> "tysiąc dwieście pięćdziesiąt złotych 50/100".
// Z poprawna odmiana: 1 -> "złoty", 2-4 / 22-24 / 1252 -> "złote", reszta (w tym 12-14) -> "złotych".

const UNITS = ["", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć"];
const TEENS = [
  "dziesięć",
  "jedenaście",
  "dwanaście",
  "trzynaście",
  "czternaście",
  "piętnaście",
  "szesnaście",
  "siedemnaście",
  "osiemnaście",
  "dziewiętnaście",
];
const TENS = [
  "",
  "",
  "dwadzieścia",
  "trzydzieści",
  "czterdzieści",
  "pięćdziesiąt",
  "sześćdziesiąt",
  "siedemdziesiąt",
  "osiemdziesiąt",
  "dziewięćdziesiąt",
];
const HUNDREDS = ["", "sto", "dwieście", "trzysta", "czterysta", "pięćset", "sześćset", "siedemset", "osiemset", "dziewięćset"];
// [1, 2-4, 5+] - indeks = rzad wielkosci (0 = jednosci, 1 = tysiace, 2 = miliony)
const GROUPS = [
  null,
  ["tysiąc", "tysiące", "tysięcy"],
  ["milion", "miliony", "milionów"],
];
const ZLOTY = ["złoty", "złote", "złotych"];

// ktora forma rzeczownika po liczbie n: 0 = "1 złoty", 1 = "2 złote", 2 = "5 złotych"
function pluralForm(n) {
  if (n === 1) return 0;
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 1;
  return 2;
}

// 0..999 -> slowa
function tripleWords(n) {
  const parts = [HUNDREDS[Math.floor(n / 100)]];
  const rest = n % 100;
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else parts.push(TENS[Math.floor(rest / 10)], UNITS[rest % 10]);
  return parts.filter(Boolean).join(" ");
}

// liczba calkowita >= 0 -> slowa ("tysiąc dwieście pięćdziesiąt")
function numberWords(n) {
  if (n === 0) return "zero";
  const parts = [];
  for (let g = GROUPS.length - 1; g >= 0; g--) {
    const value = Math.floor(n / 1000 ** g) % 1000;
    if (!value) continue;
    if (g === 0) parts.push(tripleWords(value));
    else if (value === 1) parts.push(GROUPS[g][0]); // "tysiąc", nie "jeden tysiąc"
    else parts.push(tripleWords(value), GROUPS[g][pluralForm(value)]);
  }
  return parts.join(" ");
}

function slownie(grosze) {
  const total = Math.round(Number(grosze) || 0);
  const zl = Math.floor(total / 100);
  const gr = total % 100;
  return `${numberWords(zl)} ${ZLOTY[pluralForm(zl)]} ${String(gr).padStart(2, "0")}/100`;
}

module.exports = { slownie, numberWords };
