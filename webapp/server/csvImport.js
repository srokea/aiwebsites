const { INTERESTED_OPTIONS, CALLERS, PLATFORM_TAGS } = require("./constants");
const { stripDiacritics } = require("./text");

function normalize(str) {
  return stripDiacritics(str).replace(/[^a-z0-9]/g, "");
}

// Uwaga: kolejnosc aliasow ma znaczenie przy dopasowaniu "zawiera sie w" (patrz buildHeaderMap) -
// dluzsze/bardziej specyficzne aliasy powinny wygrywac z krotszymi.
const FIELD_ALIASES = {
  company_name: ["nazwafirmy", "nazwa", "firma", "company", "companyname", "businessname", "nazwabiznesu", "salon"],
  city: ["miasto", "city", "miejscowosc"],
  phone: ["telefon", "phone", "numer", "nrtelefonu", "tel", "numertelefonu"],
  quality: ["jakosc", "quality", "ocena"],
  has_social: [
    "czymajawlasnastrone",
    "czymawlasnastrone",
    "czymajastrone",
    "majawlasnastrone",
    "majastrone",
    "czymajasocial",
    "majasocial",
    "hassocial",
  ],
  website_url: ["url", "strona", "website", "link", "stronainternetowa", "socialurl", "profil", "www"],
  answered: ["odebral", "odebrala", "answered", "odebrano"],
  interested: ["zainteresowany", "zainteresowana", "interested"],
  caller: ["ktodzwonil", "caller", "dzwonil", "ktodzwonila"],
  reminder: ["reminder", "przypomnienie"],
  callback_when: ["kiedyoddzwonic", "kiedyzadzwonic", "kiedydzwonic", "callbackwhen", "oddzwonic"],
  google_term: ["termingooglemeet", "termingoogle", "googleterm", "terminspotkania"],
  notes: ["notatki", "notes", "uwagi", "notatkimoj", "notatkimoje"],
};

const TRUTHY = new Set(["tak", "yes", "y", "true", "1", "x", "v"]);

function truthy(val) {
  return TRUTHY.has(normalize(val));
}

function normalizeInterested(raw) {
  const n = normalize(raw);
  if (!n) return null;
  const found = INTERESTED_OPTIONS.find((o) => normalize(o.label) === n || o.value === n);
  return found ? found.value : null;
}

function normalizeCaller(raw) {
  const n = normalize(raw);
  if (!n) return null;
  const found = CALLERS.find((c) => normalize(c) === n);
  return found || null;
}

// Buduje mape: nazwa naglowka z pliku CSV -> pole w naszej bazie.
// Naglowki od scraperow/arkuszy bywaja niejednorodne (np. "Jakość biznesu (1-5)" zamiast "Jakość",
// "Termin Google Meet (w)" zamiast "Termin Google") - wiec dopasowanie idzie w dwoch przebiegach:
// najpierw dokladne rownosci, a jesli nic nie pasuje - dopasowanie "naglowek zawiera alias" (biorac
// najdluzszy pasujacy alias, zeby uniknac kolizji z krotkimi/ogolnymi aliasami).
function buildHeaderMap(headers) {
  const map = {};
  for (const header of headers) {
    const n = normalize(header);
    if (!n) continue;

    const exactTag = PLATFORM_TAGS.find((t) => n === t);
    if (exactTag) {
      map[header] = { type: "tag", tag: exactTag };
      continue;
    }

    const exactFieldEntry = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(n));
    if (exactFieldEntry) {
      map[header] = { type: "field", field: exactFieldEntry[0] };
      continue;
    }

    // fallback: najdluzszy alias/tag ktory jest podciagiem znormalizowanego naglowka
    let best = null; // { len, type, field|tag }
    for (const t of PLATFORM_TAGS) {
      if (n.includes(t) && (!best || t.length > best.len)) best = { len: t.length, type: "tag", tag: t };
    }
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        if (alias.length >= 4 && n.includes(alias) && (!best || alias.length > best.len)) {
          best = { len: alias.length, type: "field", field };
        }
      }
    }
    if (best) map[header] = best.type === "tag" ? { type: "tag", tag: best.tag } : { type: "field", field: best.field };
  }
  return map;
}

// rows: tablica obiektow z papaparse (header:true) -> pierwszy wiersz pliku traktowany jako naglowki
function mapRowsToLeads(rows) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  const headerMap = buildHeaderMap(headers);

  return rows
    .filter((row) => Object.values(row).some((v) => String(v || "").trim() !== ""))
    .map((row) => {
      const lead = {
        company_name: "",
        city: "",
        phone: "",
        quality: "",
        has_social: "",
        website_url: "",
        tag_instagram: 0,
        tag_facebook: 0,
        tag_booksy: 0,
        tag_youtube: 0,
        answered: "",
        interested: "nieruszone",
        caller: "",
        reminder: "",
        callback_when: "",
        google_term: "",
        notes: "",
        research_notes: "",
      };

      const extraNotes = [];

      for (const [header, raw] of Object.entries(row)) {
        const mapping = headerMap[header];
        const value = raw == null ? "" : String(raw).trim();
        if (!mapping || value === "") continue;

        if (mapping.type === "tag") {
          lead[`tag_${mapping.tag}`] = truthy(value) ? 1 : 0;
          continue;
        }

        switch (mapping.field) {
          case "answered":
            // Tylko Tak/Nie sa poprawne. Cokolwiek innego znaczy, ze kolumny w pliku sie
            // rozjechaly - takiej wartosci NIE wpuszczamy do bazy (psulaby statystyki),
            // laduje w notatkach do recznego sprawdzenia.
            if (truthy(value)) lead.answered = "Tak";
            else if (/^(nie|no|n)$/i.test(value)) lead.answered = "Nie";
            else extraNotes.push(`Odebrał? (import): ${value}`);
            break;
          case "has_social": {
            // scraper czasem wpisuje tu "Booksy" zamiast Tak/Nie, gdy firma nie ma strony
            // ale ma widoczna obecnosc na Booksy - w takim wypadku od razu zaznaczamy tag
            if (normalize(value) === "booksy") {
              lead.tag_booksy = 1;
              lead.has_social = "Booksy";
            } else if (truthy(value)) {
              lead.has_social = "Tak";
            } else if (/^(nie|no|n)$/i.test(value)) {
              lead.has_social = "Nie";
            } else {
              extraNotes.push(`Czy mają stronę? (import): ${value}`);
            }
            break;
          }
          case "interested": {
            const norm = normalizeInterested(value);
            if (norm) lead.interested = norm;
            else extraNotes.push(`Zainteresowany (import): ${value}`);
            break;
          }
          case "caller": {
            const norm = normalizeCaller(value);
            if (norm) lead.caller = norm;
            else extraNotes.push(`Kto dzwonil (import): ${value}`);
            break;
          }
          case "notes":
            // notatki scrapera trzymamy osobno (research_notes) - kolumna "Notatki" w UI
            // ma zostac pusta do recznego uzytku zespolu (patrz tez detectTagsAndUrl ponizej)
            lead.research_notes = value;
            break;
          default:
            lead[mapping.field] = value;
        }
      }

      if (extraNotes.length) {
        lead.notes = [lead.notes, ...extraNotes].filter(Boolean).join(" | ");
      }
      if (!lead.company_name) {
        // fallback: pierwsza niepusta kolumna jako nazwa, jesli nie rozpoznano naglowka
        const firstVal = Object.values(row).find((v) => String(v || "").trim() !== "");
        lead.company_name = firstVal ? String(firstVal).trim() : "Bez nazwy";
      }

      detectTagsAndUrlFromNotes(lead);

      return lead;
    });
}

const NOTE_TAG_PATTERNS = {
  instagram: /\b(ig|instagram)\b/i,
  facebook: /\b(fb|facebook)\b/i,
  booksy: /\bbooksy\b/i,
  youtube: /\b(yt|youtube)\b/i,
};
const URL_PATTERN = /https?:\/\/[^\s")]+/i;
const BARE_DOMAIN_PATTERN = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:pl|com|eu|net|org))\b/i;
const PLATFORM_DOMAIN_BLACKLIST = /^(www\.)?(facebook|instagram|booksy|youtube|google|tiktok|maps|fresha)\./i;
// Przeczenie moze stac zarowno przed nazwa platformy ("brak FB", "nie potwierdzono IG"),
// jak i po niej ("IG nie potwierdzony", "FB nie znaleziony") - sprawdzamy oba kierunki,
// ale tylko w obrebie tej samej frazy (do najblizszego przecinka/kropki).
const NEGATION_BEFORE = /(brak|bez|nie)\s+[^.,;]*$/i;
const NEGATION_AFTER = /\bnie\b/i;

function isNegatedMention(text, index, matchLength) {
  if (NEGATION_BEFORE.test(text.slice(0, index))) return true;
  const clauseAfter = text.slice(index + matchLength).match(/^[^.,;]*/)[0];
  return NEGATION_AFTER.test(clauseAfter);
}

// Dociaga sygnaly z surowych notatek scrapera: jesli w tekscie pada "IG"/"FB"/"Booksy"/"YouTube"
// (i nie jest to zaprzeczone), zaznacza odpowiedni tag (bez nadpisywania juz ustawionych); jesli w
// tekscie jest link/domena, uzupelnia website_url (zeby nazwa firmy w tabeli byla klikalna), o ile
// nie zostal juz podany wprost.
function detectTagsAndUrlFromNotes(lead) {
  const text = lead.research_notes || "";
  if (!text) return;

  for (const [tag, pattern] of Object.entries(NOTE_TAG_PATTERNS)) {
    if (lead[`tag_${tag}`]) continue;
    const match = pattern.exec(text);
    if (match && !isNegatedMention(text, match.index, match[0].length)) lead[`tag_${tag}`] = 1;
  }

  if (!lead.website_url) {
    const match = text.match(URL_PATTERN);
    if (match) {
      lead.website_url = match[0].replace(/[.,;]+$/, "");
    } else {
      const bare = text.match(BARE_DOMAIN_PATTERN);
      if (bare && !PLATFORM_DOMAIN_BLACKLIST.test(bare[1])) lead.website_url = `https://${bare[1]}`;
    }
  }
}

module.exports = { mapRowsToLeads, buildHeaderMap, normalize, detectTagsAndUrlFromNotes };
