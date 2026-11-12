// Licznik opinii Google dla stron klientów.
//
//   cron (raz dziennie)      -> dla każdego klienta z klienci.json pobiera ocenę i liczbę opinii
//                               z Google Places API i zapisuje w KV pod kluczem "o:<slug>"
//   GET /o/<slug>.json       -> { rating, count, updated } (to czyta strona klienta)
//   GET /o.js                -> skrypt, który podmienia liczby na stronie (patrz README.md)
//
// Strony klientów NIE są wdrażane ponownie: liczby w HTML zostają jako wartość zapasowa,
// a skrypt nadpisuje je świeżymi. Gdy worker albo Google nie odpowiada, widać stare liczby.

import klienci from "../klienci.json";

const PLACES_URL = "https://places.googleapis.com/v1/places/";
const SLUG = /^[a-z0-9-]+$/;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? "public, max-age=3600" : "no-store",
      ...extra,
    },
  });

// Pobiera ocenę i liczbę opinii jednego miejsca. Zwraca null, gdy odpowiedź jest niepełna -
// wtedy w KV zostaje poprzednia wartość (lepsza stara liczba niż zero na stronie klienta).
export async function fetchPlace(placeId, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(PLACES_URL + encodeURIComponent(placeId), {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "rating,userRatingCount" },
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const d = await res.json();
  const count = Number(d.userRatingCount);
  const rating = Number(d.rating);
  if (!Number.isInteger(count) || count < 1 || !(rating >= 1 && rating <= 5)) return null;
  return { rating: Math.round(rating * 10) / 10, count };
}

export async function refreshAll(env, list = klienci, fetchImpl = fetch) {
  const report = [];
  for (const k of list) {
    if (!k || !SLUG.test(k.slug || "") || !k.place_id) {
      report.push({ slug: k && k.slug, ok: false, error: "zły wpis w klienci.json" });
      continue;
    }
    try {
      const place = await fetchPlace(k.place_id, env.GOOGLE_PLACES_KEY, fetchImpl);
      if (!place) {
        report.push({ slug: k.slug, ok: false, error: "brak oceny w odpowiedzi Google" });
        continue;
      }
      const value = { ...place, updated: new Date().toISOString().slice(0, 10) };
      await env.OPINIE_KV.put(`o:${k.slug}`, JSON.stringify(value));
      report.push({ slug: k.slug, ok: true, ...place });
    } catch (e) {
      report.push({ slug: k.slug, ok: false, error: String(e.message || e) });
    }
  }
  return report;
}

// Skrypt wstawiany na stronę klienta. Bazowy adres bierze z własnego src, więc zmiana domeny
// workera nie wymaga zmian w tym kodzie. Polska odmiana: 1 opinia, 2-4 opinie, 5+ opinii.
export const CLIENT_JS = `(function(){
  var s=document.currentScript; if(!s) return;
  var base=new URL(s.src).origin, def=s.getAttribute('data-klient')||'';
  function word(n){var a=n%10,b=n%100; if(n===1) return 'opinia'; if(a>=2&&a<=4&&!(b>=12&&b<=14)) return 'opinie'; return 'opinii';}
  var groups={};
  document.querySelectorAll('[data-opinie]').forEach(function(el){
    var k=el.getAttribute('data-opinie-klient')||def; if(!/^[a-z0-9-]+$/.test(k)) return;
    (groups[k]=groups[k]||[]).push(el);
  });
  Object.keys(groups).forEach(function(k){
    fetch(base+'/o/'+k+'.json').then(function(r){return r.ok?r.json():null;}).then(function(d){
      if(!d||!(d.count>0)) return;
      var rating=typeof d.rating==='number'?d.rating.toFixed(1).replace('.',','):'';
      groups[k].forEach(function(el){
        var t=el.getAttribute('data-opinie');
        if(t==='liczba') el.textContent=d.count;
        else if(t==='slowo') el.textContent=word(d.count);
        else if(t==='liczba-slowo') el.textContent=d.count+' '+word(d.count);
        else if(t==='ocena'&&rating) el.textContent=rating;
      });
    }).catch(function(){});
  });
})();`;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method" }, 405);

    if (pathname === "/o.js") {
      return new Response(CLIENT_JS, {
        headers: {
          "content-type": "text/javascript;charset=UTF-8",
          "cache-control": "public, max-age=86400",
          "access-control-allow-origin": "*",
          "x-content-type-options": "nosniff",
        },
      });
    }

    const m = pathname.match(/^\/o\/([a-z0-9-]+)\.json$/);
    if (!m) return json({ error: "not found" }, 404);
    const raw = await env.OPINIE_KV.get(`o:${m[1]}`);
    if (!raw) return json({ error: "brak danych" }, 404);
    return new Response(raw, {
      headers: {
        "content-type": "application/json;charset=UTF-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=3600",
      },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      refreshAll(env).then((report) => {
        const bad = report.filter((r) => !r.ok);
        console.log(`opinie: odświeżono ${report.length - bad.length}/${report.length}`, JSON.stringify(bad));
      })
    );
  },
};
