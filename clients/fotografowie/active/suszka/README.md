# Magda Suszka-Krawiec Photography — strona + panel zdjęć

Klon strony **Szkatulski Photography** (`../szkatulski`): ten sam układ podstron
i sekcji, ten sam panel do samodzielnego wgrywania zdjęć, ten sam worker (API).
Zmienione: treści, dane kontaktowe, logo i jasny motyw (biel, jasnoszare
sekcje, akcent w kolorze gliny `#96584B`, Cormorant Garamond + Work Sans).

Wdrożone na Cloudflare (2026-09-18):
- strona: https://suszka.pages.dev/ (Pages, projekt `suszka`)
- panel:  https://suszka.pages.dev/admin/ (hasło w `haslo.txt`, poza repo)
- API:    https://portfolio-suszka.project6osss.workers.dev (Worker + D1 + R2)

Zdjęcia serwuje sam worker (`R2_PUBLIC_URL` = worker + `/r2`), bucket nie jest publiczny.
Stronę wdrażaj z folderu `public/` (`wrangler pages deploy . --project-name suszka`),
bo w folderze klienta nowy wrangler bierze `wrangler.toml` workera.

---

## Zanim pokażesz to Magdzie — brakujące dane

- **E-mail** — potrzebny do formularza (`kontakt.html`, `action` formsubmit),
  polityki prywatności i widgetu. Dopóki w `action` jest `UZUPELNIJ_EMAIL`,
  formularz nie wysyła niczego, tylko prosi o telefon.
- **Cennik** — `cennik.html` ma cztery rodzaje sesji z pustymi (kreskowanymi)
  polami na kwoty.
- **O mnie** — kilka zdań od Magdy, w kreskowane pole w sekcji „O mnie".
- **Link „Napisz opinię" z Google** — teraz to wyszukiwanie w Mapach.
- **Domena** — do `canonical`, `og:url` i absolutnego `og:image`.
- **Zdjęcia z sesji** — Magda wgrywa je sama przez panel (portfolio + tło hero).

## Co jest w środku

```
suszka/
├── public/                     ← to idzie na Cloudflare Pages
│   ├── index.html              ← hero z logo, O mnie, (Zaufali mi), opinie
│   ├── portfolio.html          ← galeria z panelu: kategorie, albumy, lightbox
│   ├── cennik.html
│   ├── kontakt.html            ← formularz, telefon, godziny z „dziś", mapa
│   ├── privacy.html
│   ├── admin/index.html        ← panel zdjęć (jasny, kategorie Magdy)
│   └── assets/
│       ├── css/style.css
│       ├── fonts/              ← Cormorant Garamond, Work Sans (lokalnie, RODO)
│       ├── img/                ← logo (PNG z przezroczystością), portrety, avatar, og
│       └── js/                 ← site.js, gallery.js, widget.js
├── photos/                     ← oryginały od klientki (logo.jpg, 2 portrety)
├── worker/  schema.sql  wrangler.toml
└── brief.md
```

### Czym różni się od Szkatulskiego

1. **Kategorie w panelu:** `Ciąża`, `Noworodki`, `Rodzina`, `Sesje kobiece`, `Studio`.
2. **Bez podstrony Wideo** i bez przełącznika Zdjęcia/Wideo w cenniku.
3. **Hero:** logo zamiast nazwiska; bez tła z panelu hero jest czysto białe.
4. **„Zaufali mi"** jest ukryte, dopóki Magda nie doda wpisu w panelu.
5. **Kontakt** ma tabelę godzin (wt–pt 9–16) z oznaczeniem „dziś" i obszar dojazdu.
6. **Logo** `assets/img/logo-*.png` wycięte z `photos/logo.jpg` (JPG miał
   wtopioną szachownicę zamiast przezroczystości).

---

## Wdrożenie backendu

Tak samo jak u Szkatulskiego, tylko z nazwami tego klienta:

```bash
cd clients/fotografowie/active/suszka
wrangler d1 create portfolio-suszka-db          # → database_id do wrangler.toml
wrangler r2 bucket create portfolio-suszka-photos
wrangler d1 execute portfolio-suszka-db --remote --file=schema.sql
wrangler secret put ADMIN_PASSWORD              # hasło, które dostanie Magda
wrangler secret put JWT_SECRET                  # min. 32 znaki
wrangler deploy
```

R2 → bucket → Settings → Public access → adres `https://pub-XXXX.r2.dev` do
`R2_PUBLIC_URL`. Uzupełnij `ALLOWED_ORIGIN` (adres Pages) i wdróż ponownie.
Adres workera wpisz w `API_BASE` w `public/assets/js/gallery.js`,
`public/assets/js/site.js` i `public/admin/index.html`.

## Testy lokalne

```bash
npx serve public -l 4325
wrangler dev              # worker na http://localhost:8787
```

Zrzuty: `node scripts/screenshot.mjs clients/fotografowie/active/suszka/public`
