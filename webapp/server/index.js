const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

require("./db"); // inicjalizuje baze i tworzy tabele przy starcie
const { requireAuth } = require("./auth");
const { scheduleBackups } = require("./backup");

const app = express();
const PORT = process.env.PORT || 3000;

// pod Cloudflare Tunnel TLS jest terminowany na tunelu - to ustawienie mowi Expressowi,
// zeby ufal naglowkowi X-Forwarded-Proto, inaczej ciasteczko sesji z flaga secure nigdy
// nie zostaloby wyslane z powrotem przez przegladarke
app.set("trust proxy", 1);

app.use(express.json());
app.use(cookieParser());
// pliki statyczne (HTML/CSS/JS) same w sobie nie ujawniaja danych leadow - jedyna
// prawdziwa granica bezpieczenstwa to /api, wiec to ja chronimy ponizej, a nie routing stron
app.use(express.static(path.join(__dirname, "..", "public")));
// wgrane zdjecia profilowe (patrz POST /api/users/:id/avatar-photo) - poza public/, bo to dane
// uzytkownikow (jak data/coldcall.db), nie kod aplikacji pod git
app.use("/avatars", express.static(path.join(__dirname, "..", "data", "avatars")));
// wgrane logo kart NFC (patrz POST /api/reviews/:slug/logo) - MUSI byc publiczne bez sesji:
// Cloudflare Worker obslugujacy mmates.pl/r/:slug pobiera ten obrazek z internetu
app.use("/review-logos", express.static(path.join(__dirname, "..", "data", "review-logos")));

// logowanie musi byc publiczne - montowane PRZED globalnym auth-gate ponizej
app.use("/api/auth", require("./routes/auth"));

// wszystko dalej pod /api wymaga zalogowania (sesja z ciasteczka albo, w przyszlosci, API key)
app.use("/api", requireAuth);

app.use("/api/niches", require("./routes/niches"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/meta", require("./routes/meta"));
app.use("/api/scripts", require("./routes/scripts"));
app.use("/api/upcoming", require("./routes/upcoming"));
app.use("/api/users", require("./routes/users"));
app.use("/api/presence", require("./routes/presence"));
app.use("/api/filter-sets", require("./routes/filterSets"));
app.use("/api/weather", require("./routes/weather"));
app.use("/api/jarvis", require("./routes/jarvis"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/finance", require("./routes/finance"));
app.use("/api/calendar", require("./routes/calendar"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/map", require("./routes/map"));
app.use("/api/reviews", require("./routes/reviews"));

// Frontend parsuje kazda odpowiedz API jako JSON, wiec bledy tez musza byc JSON-em -
// domyslnie Express oddaje HTML-owa strone bledu i front pokazalby bezsensowny komunikat.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Nie znaleziono endpointu: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error("Blad API:", err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Blad serwera" });
});

app.listen(PORT, () => {
  console.log(`Cold call tracker dziala na http://localhost:${PORT}`);
});

// baza produkcyjna zyje TYLKO na dysku serwera (nigdy w gicie, patrz .gitignore + komentarz
// w backup.js) - to jej jedyna siatka bezpieczenstwa. Backup od razu przy starcie i potem co
// 3h - baza jest mala, wiec czesty backup nic nie kosztuje, a duzo daje przy kolejnej wpadce.
scheduleBackups(3 * 60 * 60 * 1000);
