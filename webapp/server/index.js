const express = require("express");
const path = require("path");

require("./db"); // inicjalizuje baze i tworzy tabele przy starcie

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/niches", require("./routes/niches"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/meta", require("./routes/meta"));
app.use("/api/scripts", require("./routes/scripts"));
app.use("/api/upcoming", require("./routes/upcoming"));

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
