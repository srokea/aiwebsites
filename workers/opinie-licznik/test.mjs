import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
// klienci.json importuje bundler wranglera; w teście podajemy listę wprost
const mod = await import("./src/index.js").catch(async () => {
  // Node < 22.18 bez atrybutu importu JSON: wczytaj źródło bez pierwszego importu
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./src/index.js", import.meta.url), "utf8").replace(/^import klienci.*$/m, "const klienci = [];");
  const url = "data:text/javascript;base64," + Buffer.from(src).toString("base64");
  return import(url);
});
const { fetchPlace, refreshAll, CLIENT_JS } = mod;
const worker = mod.default;

const kvMock = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) }; };
const okFetch = (body, status = 200) => async (url, init) => {
  okFetch.last = { url, init };
  return new Response(JSON.stringify(body), { status });
};

test("fetchPlace: poprawna odpowiedź, zaokrąglenie, nagłówki", async () => {
  const p = await fetchPlace("ChIJabc", "KEY", okFetch({ rating: 4.86, userRatingCount: 57 }));
  assert.deepEqual(p, { rating: 4.9, count: 57 });
  assert.equal(okFetch.last.url, "https://places.googleapis.com/v1/places/ChIJabc");
  assert.equal(okFetch.last.init.headers["X-Goog-FieldMask"], "rating,userRatingCount");
});

test("fetchPlace: niepełna odpowiedź = null, błąd HTTP = wyjątek", async () => {
  assert.equal(await fetchPlace("x", "K", okFetch({})), null);
  assert.equal(await fetchPlace("x", "K", okFetch({ rating: 5, userRatingCount: 0 })), null);
  await assert.rejects(fetchPlace("x", "K", okFetch({ error: {} }, 403)), /Places API 403/);
});

test("refreshAll: zapisuje dobre, nie nadpisuje przy błędzie", async () => {
  const kv = kvMock();
  kv.m.set("o:stary", JSON.stringify({ rating: 5, count: 10, updated: "2026-01-01" }));
  const f = async (url) => url.endsWith("/dobry-id")
    ? new Response(JSON.stringify({ rating: 5, userRatingCount: 23 }))
    : new Response("{}", { status: url.endsWith("/pusty-id") ? 200 : 500 });
  const rep = await refreshAll({ OPINIE_KV: kv, GOOGLE_PLACES_KEY: "K" },
    [{ slug: "nowy", place_id: "dobry-id" }, { slug: "stary", place_id: "zly-id" }, { slug: "pusty", place_id: "pusty-id" }, { slug: "ZŁY SLUG", place_id: "x" }], f);
  assert.deepEqual(rep.map((r) => r.ok), [true, false, false, false]);
  assert.equal(JSON.parse(kv.m.get("o:nowy")).count, 23);
  assert.equal(JSON.parse(kv.m.get("o:stary")).count, 10);
  assert.equal(kv.m.has("o:pusty"), false);
});

test("worker: trasy", async () => {
  const kv = kvMock(); kv.m.set("o:salon", JSON.stringify({ rating: 4.9, count: 122, updated: "2026-11-12" }));
  const env = { OPINIE_KV: kv };
  let r = await worker.fetch(new Request("https://x/o/salon.json"), env);
  assert.equal(r.status, 200); assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal((await r.json()).count, 122);
  assert.equal((await worker.fetch(new Request("https://x/o/nie-ma.json"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://x/o/../sekret"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://x/o/salon.json", { method: "POST" }), env)).status, 405);
  r = await worker.fetch(new Request("https://x/o.js"), env);
  assert.match(r.headers.get("content-type"), /javascript/);
});

test("skrypt strony: podmiana liczb, odmiana, drugi klient, brak danych", async () => {
  const mk = (type, klient, text) => ({ textContent: text, getAttribute: (a) => (a === "data-opinie" ? type : a === "data-opinie-klient" ? klient : null) });
  const els = [mk("liczba-slowo", null, "57 opinii"), mk("ocena", null, "5,0"), mk("liczba", null, "57"), mk("slowo", null, "opinii"),
               mk("liczba-slowo", "drugi", "3 opinie"), mk("liczba-slowo", "pusty", "9 opinii")];
  const data = { glowny: { rating: 4.8, count: 122 }, drugi: { rating: 5, count: 1 } };
  const pending = [];
  const ctx = { URL, document: { currentScript: { src: "https://api.test/o.js", getAttribute: () => "glowny" }, querySelectorAll: () => els },
    fetch: (u) => { const k = u.match(/\/o\/(.+)\.json/)[1]; const p = Promise.resolve({ ok: !!data[k], json: async () => data[k] }); pending.push(p); return p; } };
  vm.runInNewContext(CLIENT_JS, ctx);
  await Promise.all(pending); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(els.map((e) => String(e.textContent)), ["122 opinie", "4,8", "122", "opinie", "1 opinia", "9 opinii"]);
});

test("odmiana słowa opinia", () => {
  const word = vm.runInNewContext("(" + CLIENT_JS.match(/function word\(n\)\{.*?\}\n/s)[0].trim() + ")");
  const f = (n) => word(n);
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112, 122, 1207].map(f),
    ["opinia", "opinie", "opinie", "opinii", "opinii", "opinii", "opinii", "opinii", "opinie", "opinii", "opinii", "opinie", "opinii"]);
});
