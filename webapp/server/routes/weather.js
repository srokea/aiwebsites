const express = require("express");

const router = express.Router();

// Piotrkow Trybunalski - stad dziala zespol, na sztywno (appka nie ma potrzeby wyboru miasta)
const LAT = 51.4055;
const LON = 19.7031;
const CITY = "Piotrków Trybunalski";

// Kody pogodowe WMO (Open-Meteo) -> emoji + polska etykieta
const WEATHER_CODES = {
  0: { icon: "☀️", label: "Bezchmurnie" },
  1: { icon: "🌤️", label: "Prawie bezchmurnie" },
  2: { icon: "⛅", label: "Częściowe zachmurzenie" },
  3: { icon: "☁️", label: "Pochmurno" },
  45: { icon: "🌫️", label: "Mgła" },
  48: { icon: "🌫️", label: "Mgła osadzająca szron" },
  51: { icon: "🌦️", label: "Mżawka słaba" },
  53: { icon: "🌦️", label: "Mżawka" },
  55: { icon: "🌦️", label: "Mżawka silna" },
  56: { icon: "🌧️", label: "Marznąca mżawka" },
  57: { icon: "🌧️", label: "Marznąca mżawka silna" },
  61: { icon: "🌧️", label: "Deszcz słaby" },
  63: { icon: "🌧️", label: "Deszcz" },
  65: { icon: "🌧️", label: "Deszcz silny" },
  66: { icon: "🌧️", label: "Marznący deszcz" },
  67: { icon: "🌧️", label: "Marznący deszcz silny" },
  71: { icon: "🌨️", label: "Śnieg słaby" },
  73: { icon: "🌨️", label: "Śnieg" },
  75: { icon: "❄️", label: "Śnieg silny" },
  77: { icon: "❄️", label: "Śnieg ziarnisty" },
  80: { icon: "🌦️", label: "Przelotny deszcz słaby" },
  81: { icon: "🌧️", label: "Przelotny deszcz" },
  82: { icon: "⛈️", label: "Przelotny deszcz gwałtowny" },
  85: { icon: "🌨️", label: "Przelotny śnieg słaby" },
  86: { icon: "❄️", label: "Przelotny śnieg silny" },
  95: { icon: "⛈️", label: "Burza" },
  96: { icon: "⛈️", label: "Burza z gradem" },
  99: { icon: "⛈️", label: "Burza z silnym gradem" },
};

// Cache w pamieci procesu - pogoda nie zmienia sie co sekunde, nie ma sensu odpytywac
// zewnetrznego API przy kazdym odswiezeniu dashboardu przez kazda osobe
let cache = null; // { data, fetchedAt }
const CACHE_MS = 20 * 60 * 1000;

router.get("/", async (req, res) => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return res.json(cache.data);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FWarsaw`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const json = await r.json();

    const meta = WEATHER_CODES[json.current.weather_code] || { icon: "🌡️", label: "" };
    const data = {
      city: CITY,
      temp: Math.round(json.current.temperature_2m),
      tempMax: Math.round(json.daily.temperature_2m_max[0]),
      tempMin: Math.round(json.daily.temperature_2m_min[0]),
      icon: meta.icon,
      label: meta.label,
    };
    cache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (err) {
    // stary cache (nawet przeterminowany) lepszy niz brak pogody na dashboardzie
    if (cache) return res.json(cache.data);
    res.status(502).json({ error: "Nie udało się pobrać pogody" });
  }
});

module.exports = router;
