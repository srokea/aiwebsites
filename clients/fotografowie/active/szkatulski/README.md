# Szkatulski Photography — strona + panel zdjęć

Strona statyczna (`public/`) plus instancja portfolio z `portfolio-template`:
Worker, D1 i R2. Na darmowym planie Cloudflare koszt to 0 zł/mies.

**Stan: strona działa bez backendu.** Dopóki `API_BASE` jest pusty, galeria
czyta 15 zdjęć leżących w `public/photos/`. Po wdrożeniu workera przełącza się
na panel, a lista lokalna zostaje jako zapas, gdyby API nie odpowiedziało.

---

## Zanim pokażesz to Filipowi

Trzy rzeczy do uzupełnienia, każda to jeden find & replace:

| Zastępnik | Gdzie | Czym zastąpić |
|---|---|---|
| `[TELEFON]` | `public/index.html`, `public/assets/js/widget.js` | numer w formacie `+48XXXXXXXXX` |
| `[EMAIL]` | `public/index.html`, `public/assets/js/widget.js`, `public/privacy.html` | adres e-mail |

```bash
cd public
grep -rl '\[TELEFON\]' . | xargs sed -i 's/\[TELEFON\]/+48123456789/g'
grep -rl '\[EMAIL\]' . | xargs sed -i 's/\[EMAIL\]/filip@example.pl/g'
```

Poza tym: **cennik pochodzi z profilu Oferteo i wymaga potwierdzenia z Filipem**
(komentarz `TODO` przy sekcji cennika w `index.html`).

---

## Co jest w środku

```
szkatulski/
├── public/                     ← to idzie na Cloudflare Pages
│   ├── index.html              ← strona główna
│   ├── privacy.html            ← polityka prywatności (RODO, obowiązkowa)
│   ├── favicon.svg
│   ├── admin/index.html        ← panel zdjęć (jeden samodzielny plik)
│   ├── assets/
│   │   ├── css/style.css       ← cały arkusz, zero frameworka
│   │   ├── fonts/*.woff2       ← Archivo, Bodoni Moda, Work Sans (lokalnie, RODO)
│   │   └── js/
│   │       ├── site.js         ← nawigacja, licznik liczb, formularz
│   │       ├── gallery.js      ← galeria, filtry, lightbox, sekcja wideo
│   │       └── widget.js       ← okienko kontaktowe
│   ├── photos/                 ← zdjęcia z repo (zapas galerii)
│   └── videos/                 ← puste, czeka na rolki Filipa
├── worker/                     ← API (kopia z portfolio-template + obsługa rolek)
├── photos-oryginaly/           ← surowe zrzuty z Instagrama, przed przycięciem
├── schema.sql
├── wrangler.toml
└── brief.md
```

### Czym różni się od `portfolio-template`

1. **Rolki wideo.** Schemat dopuszcza `type = 'video'` i ma kolumnę `poster_key`.
   Worker wystawia `POST /api/items/upload-video` (plik + klatka-plakat + podpis).
   Panel wycina plakat z ~0,3 s filmu w przeglądarce, tak samo jak konwertuje
   zdjęcia do WebP. Kasowanie folderu, albumu i kafelka sprząta też plakaty z R2.
2. **Pięć stałych kategorii.** `Sport`, `Auta`, `18stki & Eventy`, `Koncerty`,
   `Warsztat` to zwykłe foldery. Przy pierwszym uruchomieniu panel proponuje
   założenie ich jednym kliknięciem. Nazwy muszą się zgadzać z tablicą
   `CATEGORIES` w `public/assets/js/gallery.js`.
3. **Siatka.** Strona publiczna ignoruje `grid_w` / `grid_h` i układa zdjęcia
   w masonry (CSS `columns`, 2/3/4 kolumny). Pola zostają w bazie, panel dalej
   ich używa do własnego podglądu.
4. **Opis alternatywny.** Po wgraniu zdjęcia o nazwie z aparatu (`IMG_4821`)
   panel podstawia podpowiedź z nazwy kategorii. Filip może ją nadpisać
   z menu kafelka („Zmień opis zdjęcia”).
5. **Wygląd panelu** dopasowany do palety strony.

---

## Wdrożenie backendu

Wszystko poniżej robisz raz. `wrangler` globalnie: `npm i -g wrangler`.

```bash
cd clients/fotografowie/active/szkatulski

# 1. Zasoby
wrangler d1 create portfolio-szkatulski-db      # → database_id do wrangler.toml
wrangler r2 bucket create portfolio-szkatulski-photos
```

W Cloudflare Dashboard → **R2 → bucket → Settings → Public access** włącz
publiczny dostęp. Dostaniesz adres `https://pub-XXXX.r2.dev` — to `R2_PUBLIC_URL`.
Bez tego zdjęcia się nie wyświetlą.

```bash
# 2. Schemat
wrangler d1 execute portfolio-szkatulski-db --remote --file=schema.sql

# 3. Hasło i sekret (NIE trafiają do repo)
wrangler secret put ADMIN_PASSWORD     # hasło, które dostanie Filip
wrangler secret put JWT_SECRET         # min. 32 znaki: openssl rand -base64 48

# 4. Worker
wrangler deploy                        # → skopiuj URL workera
```

Uzupełnij `wrangler.toml`: `database_id`, `R2_PUBLIC_URL`, `ALLOWED_ORIGIN`
(adres Pages, bez ukośnika na końcu), i wdróż ponownie.

### Przełączenie strony na API

W **dwóch** plikach wpisz adres workera w `API_BASE`:

- `public/assets/js/gallery.js`
- `public/admin/index.html`

Potem wgraj `public/` na Cloudflare Pages (build output = `public/`).

- Strona: `https://szkatulski.pages.dev/`
- Panel: `https://szkatulski.pages.dev/admin/`

---

## Zdjęcia

Wszystkie zdjęcia w `public/photos/` to zrzuty z Instagrama (900–1230 px).
Miały na sobie interfejs Instagrama: strzałki karuzeli, kropki stron, pasek
z watermarkiem. Zostały przycięte; **surowe pliki są w `photos-oryginaly/`**.

To znaczy, że hero na desktopie jest skalowane w górę z 1126 px. Warto poprosić
Filipa o oryginały z aparatu, zwłaszcza o kadr ze stadionu w deszczu.

Zalecany rozmiar plików, które Filip wrzuci przez panel: dłuższy bok ~2000 px,
jakość 82, WebP. Panel i tak przeskaluje i przekonwertuje to sam w przeglądarce.

## Rolki

`public/videos/` jest puste, więc sekcja **Wideo** pokazuje cztery uczciwe
kafle 9:16 z podpisem „miejsce na rolkę”. Kod jest gotowy: rolki wgrane przez
panel (`+ Rolka`) pojawią się same. Rolki można też wpisać ręcznie w tablicy
`LOCAL_VIDEOS` w `gallery.js`, w formacie `{ src, poster, caption }`.

Gdy rolka będzie dostępna, tłem hero może zostać `<video>` (komentarz `TODO`
w `index.html`) — tylko desktop, tylko bez `prefers-reduced-motion`.

---

## Testy lokalne

```bash
npx serve public          # albo dowolny statyczny serwer
wrangler dev              # worker na http://localhost:8787
```

Do `wrangler dev` skopiuj `.dev.vars.example` → `.dev.vars` i dopisz adres
frontendu do `ALLOWED_ORIGIN` po przecinku.

Zrzuty ekranu: `node scripts/screenshot.mjs clients/fotografowie/active/szkatulski/public`
