# Paulina Kotas Fotografia — strona + panel zdjęć

Instancja `portfolio-template` (patrz `../../portfolio-template/README.md` i
`PLAYBOOK.md` obok): ten sam worker, baza i panel do samodzielnego wgrywania
zdjęć. Frontend bespoke, jedna strona, własny branding Pauliny (jasna baza +
zieleń marki `#3F5F0A`, Bodoni Moda + Work Sans). Nie jest klonem wyglądu Suszki
ani Szkatulskiego.

Stan: zbudowane i przetestowane lokalnie (`wrangler dev`), **jeszcze nie wdrożone**.

## Co jest w środku

```
kotas/
├── public/                     ← idzie na Cloudflare Pages
│   ├── index.html              ← hero, pasek sesji, o mnie, sesje (zakładki + galeria z panelu), cennik, opinie (karuzela), kontakt
│   ├── privacy.html
│   ├── favicon.svg             ← tymczasowy monogram PK (do podmiany na logo)
│   ├── admin/index.html        ← panel z szablonu: jasny motyw, lokalne fonty, „Utwórz 6 kategorii”
│   └── assets/
│       ├── css/style.css, css/admin-fonts.css
│       ├── js/site.js          ← portfolio z API + zapas lokalny, lightbox, scroll-spy, „dziś”, hero z panelu
│       ├── fonts/              ← Bodoni Moda, Work Sans + fonty bloków tekstu (lokalnie, RODO)
│       ├── img/                ← hero, portret, og.jpg
│       └── photos/<kategoria>/ ← 34 zdjęcia z FB (WebP 800 px kafel + 1600 px lightbox)
├── photos/                     ← oryginały od klientki (nie idą na stronę)
├── worker/  schema.sql  wrangler.toml
└── brief.md  prompt-do-claude.md
```

### Czym różni się od portfolio-template

1. **Kategorie** (foldery w panelu): Kobiece, Ciążowe, Noworodkowe, Rodzinne,
   Dziecięce, Reportaże. Pusty panel pokazuje przycisk „Utwórz 6 kategorii”.
   Strona rozpoznaje kategorię po początku nazwy folderu (`site.js → CATEGORIES`)
   i łączy ją z kartą w sekcji Oferta.
2. **Zapas zdjęć**: dopóki worker nie odpowiada albo nie ma w nim żadnego
   zdjęcia, strona pokazuje zdjęcia z `public/assets/photos/`. Gdy w panelu
   pojawi się choć jedno zdjęcie, strona przełącza się w całości na panel,
   dlatego przy wdrożeniu wgrywamy je skryptem `seed_panel.py` (niżej).
3. **Worker**: dodana gałąź `GET /r2/…` (z instancji Suszki), zdjęcia idą przez
   workera, bucket R2 nie musi być publiczny.
4. Sekcja „Sesje” łączy ofertę i portfolio: sześć kart rodzajów sesji jest
   zawsze widocznych (okładka = pierwsze zdjęcie kategorii), klik pokazuje
   galerię pod spodem. Kategoria bez zdjęć ma kreskowane pola.
5. Opinie: „Zostaw opinię” i „Wszystkie opinie w Google” z place_id
   `ChIJrVcdAbH1GUcR_DoljQcujCM` (z wizytówki Google w `leads/`).

## Wdrożenie

```bash
cd clients/fotografowie/active/kotas
npx wrangler d1 create portfolio-kotas-db          # → database_id do wrangler.toml
npx wrangler r2 bucket create portfolio-kotas-photos
npx wrangler d1 execute portfolio-kotas-db --remote --file=schema.sql
npx wrangler secret put ADMIN_PASSWORD             # hasło dla Pauliny
npx wrangler secret put JWT_SECRET                 # min. 32 znaki
npx wrangler deploy
cd public && npx wrangler pages deploy . --project-name kotas
```

Potem **od razu wgraj zdjęcia z FB do panelu** (jeden raz, z folderu klienta):

```bash
python seed_panel.py --api https://portfolio-kotas.project6osss.workers.dev --password HASLO_PANELU
```

Skrypt robi to samo co panel (WebP, max 2000 px, pionowe = wyższy kafel),
wgrywa 34 zdjęcia do 5 kategorii w kolejności ze strony, zakłada brakujące
kategorie i pomija te, w których już są zdjęcia (można puścić ponownie).
Bez tego kroku strona po pierwszym zdjęciu wgranym przez Paulinę pokaże
puste pozostałe kategorie, bo przełącza się na panel w całości.

Adres workera (`https://portfolio-kotas.project6osss.workers.dev`) jest już
wpisany w `public/assets/js/site.js` i `public/admin/index.html`, a w
`wrangler.toml` w `R2_PUBLIC_URL`. Jeśli wyjdzie inny, popraw w trzech miejscach.
`ALLOWED_ORIGIN` = adres Pages (+ ewentualna domena). Po wdrożeniu podmień
`og:url` / `og:image` w `index.html` na pełny adres.

## Test lokalny

```bash
npx wrangler d1 execute portfolio-kotas-db --local --file=schema.sql
npx wrangler dev --port 8787 --ip 127.0.0.1        # .dev.vars: hasło, R2_PUBLIC_URL=http://localhost:8787/r2
cd public && python -m http.server 4330 --bind 127.0.0.1
```

Strona: http://127.0.0.1:4330/ · panel: http://127.0.0.1:4330/admin/

## Do potwierdzenia z Pauliną (z briefu)

- Cennik: kwoty („od ___ zł”, puste kreski w sekcji Cennik) i ewentualnie krótki opis do każdej sesji.
- Oryginał logo (biały i ciemny). Na stronie jest tymczasowy napis + monogram.
- Dokładny kolor zieleni z pliku logo/okładki (teraz `#3F5F0A` z briefu).
- Reszta bio do „O mnie” (teraz trzy krótkie zdania). Zdanie „Nie musicie umieć pozować…”
  napisane na podstawie opinii klientów, do potwierdzenia. Końcówka „zatrzymuję dla Was
  czas na fotografiach” dopowiedziana jak w demo gotowastrona98.pl, do potwierdzenia.
- E-mail (kotaspaulina@interia.pl tylko z cudzego demo, nie wstawiony).
- bookmy.art: stała rezerwacja czy tylko akcja świąteczna (Basic vs Website+).
- Zdjęcia z reportaży. Godziny jako „kontakt telefoniczny”.
- Pełne treści uciętych opinii; literówki w cytatach są z oryginału.
