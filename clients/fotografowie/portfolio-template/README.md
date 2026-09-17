# portfolio-template — szablon portfolio dla fotografa

Jeden folder = jedna, całkowicie niezależna instancja dla jednego klienta:
własne Cloudflare Pages, Worker, D1 i R2. Na darmowym planie Cloudflare
koszt takiej instancji to **0 zł/mies.**

Nowy klient = kopia tego folderu + podmiana `public/index.html` + deploy.
Backend, panel admina i baza są identyczne dla każdego klienta.

---

## Co jest w środku

```
portfolio-template/
├── public/
│   ├── index.html          ← PODMIENIANE per klient (publiczne portfolio)
│   ├── admin/
│   │   └── index.html      ← stały panel admina (nie ruszać per klient)
│   └── assets/
│       └── public.css      ← style placeholdera, można nadpisać per klient
├── worker/
│   ├── index.js            ← routing + CORS
│   ├── auth.js             ← logowanie + JWT (Web Crypto, zero bibliotek)
│   ├── folders.js          ← CRUD folderów + odczyt całej zawartości folderu
│   ├── albums.js           ← CRUD albumów (sekcji w folderze)
│   └── items.js            ← kafelki: upload zdjęć do R2 + bloki tekstu
├── schema.sql
├── wrangler.toml
├── .dev.vars.example       ← hasło/sekret do `wrangler dev` (skopiuj do .dev.vars)
└── README.md
```

Panel admina jest **jednym samodzielnym plikiem** — cały CSS i JS siedzi
w `public/admin/index.html`. Dzięki temu działa niezależnie od tego, jak
zbudujesz frontend klienta, i nie ma osobnych `assets/admin.css` / `admin.js`.

Zero npm, zero frameworków, zero `node_modules`. Do deployu potrzebujesz
tylko `wrangler` (`npm i -g wrangler`, jednorazowo, globalnie).

---

# Nowy klient — instrukcja deploymentu

Przykład dla klienta `jan-kowalski`. Podmień nazwę wszędzie na własną.

## 1. Skopiuj szablon

```bash
cp -r portfolio-template portfolio-jan-kowalski
cd portfolio-jan-kowalski
```

## 2. Utwórz zasoby Cloudflare

```bash
wrangler d1 create portfolio-jan-kowalski-db
# → skopiuj database_id do wrangler.toml

wrangler r2 bucket create portfolio-jan-kowalski-photos
```

Następnie w Cloudflare Dashboard → **R2 → bucket → Settings → Public access**
włącz publiczny dostęp. Dostaniesz adres w stylu `https://pub-ab12cd34.r2.dev` —
to jest `R2_PUBLIC_URL`. Bez tego zdjęcia się nie wyświetlą.

## 3. Skonfiguruj wrangler.toml

Zmień: `name`, `database_name`, `database_id`, `bucket_name`, `R2_PUBLIC_URL`,
`ALLOWED_ORIGIN`.

`ADMIN_PASSWORD` i `JWT_SECRET` **nie wpisuj do `wrangler.toml`** — ustawisz je
w kroku 5 jako sekrety, żeby hasło klienta nie trafiło do repozytorium.

## 4. Wgraj schemat bazy

```bash
wrangler d1 execute portfolio-jan-kowalski-db --remote --file=schema.sql
```

## 5. Ustaw hasło i sekret

```bash
wrangler secret put ADMIN_PASSWORD
# → hasło do panelu, przekazujesz je fotografowi

wrangler secret put JWT_SECRET
# → losowy ciąg min. 32 znaki, np. z: openssl rand -base64 48
```

## 6. Deploy workera

```bash
wrangler deploy
# → skopiuj URL workera, np. https://portfolio-jan-kowalski.xxx.workers.dev
```

## 7. Ustaw API_BASE w plikach frontendu

W `public/index.html` **i** `public/admin/index.html` zmień jedną linię:

```js
const API_BASE = 'https://portfolio-jan-kowalski.xxx.workers.dev';
```

## 8. Deploy frontendu na Cloudflare Pages

- Wgraj folder `public/` na Cloudflare Pages, **albo**
- podłącz repo git i ustaw build output = `public/`.

Skopiuj URL Pages, np. `https://portfolio-jan-kowalski.pages.dev`.

## 9. Ustaw ALLOWED_ORIGIN w workerze

W `wrangler.toml` wpisz adres z kroku 8 (bez ukośnika na końcu) i wdróż ponownie:

```toml
ALLOWED_ORIGIN = "https://portfolio-jan-kowalski.pages.dev"
```

```bash
wrangler deploy
```

Jeśli klient ma własną domenę, podaj tu ją. Można wpisać kilka adresów po
przecinku (np. domena + `http://localhost:8788` do testów).

## 10. Gotowe

- Portfolio publiczne: `https://portfolio-jan-kowalski.pages.dev/`
- Panel admina: `https://portfolio-jan-kowalski.pages.dev/admin/`

Zaloguj się hasłem z kroku 5, dodaj pierwszy folder i wrzuć zdjęcia.

---

## Praca nad frontendem klienta

Podmieniasz **tylko** `public/index.html` (i ewentualnie `public/assets/public.css`).
Reszta zostaje bez zmian. Frontend potrzebuje dwóch publicznych endpointów:

```
GET {API_BASE}/api/folders               → [{ id, name, position }]
GET {API_BASE}/api/folders/{id}/content  → [{ id, name, position, items: [...] }]
```

Drugi endpoint zwraca **wszystkie albumy folderu razem z kafelkami**, jednym
zapytaniem — tak wyświetla się folder klikany w zakładce (albumy jeden pod
drugim). `name` albumu może być pusty — wtedy sekcja nie ma nagłówka.

Kafelek (`items[]`) ma wspólne pola `id`, `type`, `grid_w` (1–6), `grid_h` (1–4),
`position`, a poza tym zależnie od `type`:

```
type: 'photo'  → url, display_name
type: 'text'   → html (bezpieczny: tylko b/i/u/br/div/p, bez atrybutów),
                 style: { font, size, align, color, bg }
```

Siatka ma **6 kolumn** od 700 px szerokości; poniżej przechodzi na 2 kolumny
(przelicznik w JS, w `public/index.html` — funkcja `setGrid`). Kolejność
(`position`) jest już posortowana przez API.

Link do konkretnego folderu: `/#f={folderId}` — tego samego formatu używa
podgląd w panelu admina.

---

## API — pełna lista endpointów

Odpowiedzi zawsze w formacie `{ ok: true, data: ... }` albo `{ ok: false, error: "..." }`.

| Metoda | Ścieżka | Auth | Opis |
|---|---|---|---|
| POST | `/api/auth` | — | `{ password }` → `{ token }` (JWT ważny 24 h) |
| GET | `/api/folders` | — | lista folderów wg `position` |
| POST | `/api/folders` | ✅ | `{ name }` → nowy folder + jeden pusty album w środku |
| PUT | `/api/folders/:id` | ✅ | `{ name?, position? }` |
| DELETE | `/api/folders/:id` | ✅ | usuwa folder + jego albumy i zdjęcia z D1 i R2 |
| GET | `/api/folders/:id/content` | — | albumy folderu wg `position`, każdy z `items[]` |
| POST | `/api/albums` | ✅ | `{ folderId, name? }` → nowy album na końcu folderu |
| PUT | `/api/albums/:id` | ✅ | `{ name?, position? }` |
| DELETE | `/api/albums/:id` | ✅ | usuwa album + jego kafelki z D1 i zdjęcia z R2 |
| POST | `/api/items/upload` | ✅ | FormData: `file` (WebP), `albumId`, `portrait?` (`'1'`) |
| POST | `/api/items/text` | ✅ | `{ albumId, html?, style? }` → nowy blok tekstu |
| PUT | `/api/items/:id` | ✅ | `{ grid_w?, grid_h?, position?, album_id?, display_name?, html?, style? }` |
| DELETE | `/api/items/:id` | ✅ | usuwa kafelek (dla zdjęcia też plik z R2) |

`album_id` w PUT-cie na `/api/items/:id` przenosi kafelek do innego albumu —
tak działa przeciąganie zdjęcia między albumami w panelu.

Auth = nagłówek `Authorization: Bearer <token>`.

---

## Jak to działa — rzeczy, o których warto pamiętać

**Struktura treści ma trzy poziomy.** Folder to zakładka w nawigacji. W folderze
jest jeden album albo więcej — to sekcje wyświetlane jedna pod drugą (np. folder
„Śluby” → albumy „Ślub Gosi”, „Ślub Asi”). W albumie jest siatka kafelków:
zdjęć i bloków tekstu, wymieszanych w dowolnej kolejności. Nowy folder dostaje
od razu jeden album bez nazwy, żeby dało się wrzucać zdjęcia bez dodatkowego kroku.

**Konwersja zdjęć robi się w przeglądarce.** Panel admina skaluje zdjęcie do
max 2000 px dłuższym bokiem i zapisuje jako WebP (jakość 0.85) przez Canvas API,
dopiero potem wysyła. Worker ma limit RAM-u i nie przetwarza obrazów. Panel
rozpoznaje zdjęcia pionowe i wysyła `portrait=1` — takie zdjęcie dostaje wyższy
domyślny kafelek (2×3 zamiast 2×2).

**Zdjęcia idą prosto z R2, nie przez workera.** URL składany jest z
`R2_PUBLIC_URL` + klucza `{folderId}/{itemId}.webp`. Pliki mają
`Cache-Control: immutable`, więc ładują się z cache Cloudflare.

**Kolumny `url` nie ma w bazie** — jest doklejana przy odczycie. Dzięki temu
zmiana domeny bucketu nie wymaga migracji danych.

**HTML bloków tekstu jest czyszczony po stronie workera** (`sanitizeHtml`
w `worker/items.js`), nie tylko w przeglądarce — bo strona publiczna wstawia
go przez `innerHTML`. Zostają wyłącznie `<b> <i> <u> <br> <div> <p>`, bez
żadnych atrybutów. Styl (`font`, `size`, `align`, `color`, `bg`) jest osobno
walidowany: font musi być z listy w panelu, kolory muszą być poprawnym hex-em.

**Panel pokazuje kafelki w tej samej skali co strona publiczna.** Siatka
w panelu ma te same proporcje (6 kolumn, `container query` na szerokość),
więc rozmiar tekstu i kafelków, które widzisz w panelu, odpowiada temu, co
zobaczy klient — nie trzeba zgadywać przez „Podgląd strony”.

**Auto-save.** Każda zmiana w panelu (nazwa, tekst, styl, rozmiar kafelka,
kolejność, przeniesienie między albumami) leci PUT-em po 800 ms ciszy.
Nie ma przycisku „Zapisz”.

**Limity darmowego planu Cloudflare** (Workers, D1, R2) z dużym zapasem
wystarczają na portfolio fotografa. Aktualne liczby: developers.cloudflare.com (Pricing).

---

## Typowe problemy

**Zdjęcia się nie wyświetlają (403 albo 404 z r2.dev)**
Bucket nie ma włączonego publicznego dostępu (krok 2) albo `R2_PUBLIC_URL`
w `wrangler.toml` jest niepoprawny.

**Panel pokazuje „Brak połączenia z API”**
`ALLOWED_ORIGIN` nie zgadza się z domeną, z której otwierasz panel — przeglądarka
blokuje odpowiedź na CORS. Sprawdź, czy nie ma ukośnika na końcu i czy zgadza
się `http`/`https`.

**Panel wyrzuca na ekran logowania przy każdym kliknięciu**
Token wygasł (24 h) albo zmieniłeś `JWT_SECRET` po wdrożeniu. Zaloguj się ponownie.

**`wrangler d1 execute` nie zmienia niczego w produkcji**
Bez flagi `--remote` wrangler pisze do lokalnej kopii bazy.

---

## Lokalny development

```bash
wrangler dev            # worker na http://localhost:8787
npx serve public        # frontend — dowolny statyczny serwer
```

Hasło i sekret do testów lokalnych: skopiuj `.dev.vars.example` do `.dev.vars`
(plik jest w `.gitignore`). Dopisz adres frontendu do `ALLOWED_ORIGIN`
(po przecinku) i ustaw `API_BASE = 'http://localhost:8787'`.
