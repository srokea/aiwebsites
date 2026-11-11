# RSaaS — Restaurant Software as a Service

Wspólny system rezerwacji stolików dla wielu restauracji. **Jeden** projekt Supabase obsługuje restauracje A, B, C…: poprawkę wgrywasz raz i działa u wszystkich. Pierwsza restauracja to Alticcio (`clients/sklepy/active/alticcio`).

Stack: statyczne strony restauracji + Supabase (baza, realtime, logowanie panelu) + Cloudflare Pages (hosting, funkcja `/api/reserve`, Turnstile) + Gmail SMTP restauracji. Koszt: 0 zł na planach Free; przejście na Supabase Pro (~25 $/mies.) — patrz [Kiedy Pro](#kiedy-przejść-na-supabase-pro).

```
gość ── strona restauracji (#booking-app) ── js/rsaas/booking.js
          ├─ konfiguracja + wolne godziny ─ Supabase (publishable, RPC get_public_config / get_available_slots, slug z js/config.js)
          ├─ realtime „availability:<slug>” ─ Supabase (kanał broadcast, niesie tylko datę)
          └─ POST /api/reserve ──────────── functions/api/reserve.js strony → rsaas/server/reserve-handler.js
                                              ├─ Turnstile (czy to człowiek)
                                              ├─ Supabase RPC create_reservation (klucz secret, slug ze zmiennej RESTAURANT_SLUG)
                                              └─ mail z linkiem „Odwołaj” ─ Gmail restauracji (SMTP)
gość z maila ── /odwolaj/#<token> ── js/rsaas/cancel.js ── Supabase (publishable, RPC po tokenie)
obsługa ── /panel/ ── js/rsaas/panel.js ─── Supabase (logowanie; widzi tylko swoje restauracje: tabela staff + RLS)
GitHub Actions ── codziennie: ping + zaszyfrowany pg_dump (artefakt, 30 dni)
```

## Zasady bezpieczeństwa (nie łamać przy zmianach)

- **Restaurację wskazuje slug.** Gość: z `js/config.js`. Zapis rezerwacji: wyłącznie ze zmiennej `RESTAURANT_SLUG` w Cloudflare — nigdy z treści żądania. Dzięki temu strona A nie zapisze rezerwacji u B.
- **Gość nie dotyka tabel.** Kluczem publishable da się tylko: pobrać konfigurację i wolne godziny restauracji, podejrzeć/odwołać **jedną** rezerwację tokenem z maila (64 znaki losowe; w bazie leży tylko skrót).
- **Obsługa widzi tylko swoje restauracje.** Każda funkcja panelu sprawdza `public.staff`; RLS na `reservations` filtruje podgląd na żywo. Cudza rezerwacja wygląda jak nieistniejąca (`not_found`).
- **Podwójną rezerwację blokuje baza** (`reservations_no_overlap`), a stolik innej restauracji — złożony klucz obcy. Nie kod strony.
- Testy izolacji (sekcja 10 w `supabase/tests/booking_test.sql`) muszą przechodzić przed każdym wdrożeniem zmian w SQL.

Plan rozwoju i znane braki: [TODO.md](TODO.md).

## Restauracje w RSaaS

| Slug | Strona w repo | Cloudflare Pages | Adres |
|---|---|---|---|
| `alticcio` | `clients/sklepy/active/alticcio` | projekt `alticcio` (Git, watch paths: folder strony + `rsaas/*`) | https://alticcio.pages.dev (bez domeny, `noindex`) |

Projekt Pages bez *watch paths* buduje się przy **każdym** commicie w repo — buildy innych klientów lądują w kolejce jako „queued”. Zawsze ustawiaj watch paths.

## Struktura

| Ścieżka | Co |
|---|---|
| `supabase/migrations/` | schemat, funkcje, uprawnienia + realtime + retencja. Po kolei 0001 → 0003 |
| `supabase/new_restaurant.sql` | szablon dodania restauracji (idempotentny) |
| `supabase/tests/booking_test.sql` | testy logiki i izolacji, kończą się `rollback` |
| `client/` | kod przeglądarki: widget, panel, odwołanie. `build.sh` strony kopiuje go do `dist/js/rsaas/`. Importuje `../config.js` strony |
| `server/` | logika `/api/reserve`, SMTP, treść maila. `build.sh` kopiuje go do `.rsaas/` strony |
| `tests/` | testy Node (bez sieci) i test wyścigu |
| `../.github/workflows/rsaas-backup.yml` | backup + ping |

Strona restauracji ma u siebie tylko to, co jej własne: `index.html`, `css/booking.css`, `panel/index.html`, `odwolaj/index.html` (logo, tytuł), `js/config.js`, `functions/api/reserve.js` (kolory i podpis maila) i `build.sh`.

---

## Jednorazowo: projekt Supabase „rsaas”

1. Nowy projekt **rsaas**, **region: Central EU (Frankfurt)** (polityki prywatności restauracji się na to powołują).
2. Organization → Legal Documents → zaakceptuj **DPA**.
3. Migracje, po kolei, każdy plik w całości (SQL Editor albo `psql`, patrz [Praca lokalna](#praca-lokalna)):
   `0001_schema.sql` → `0002_functions.sql` → `0003_security_realtime.sql`.
4. `supabase/tests/booking_test.sql` → musi pojawić się `WSZYSTKIE TESTY OK`.
5. **Authentication → Sign In / Providers:** wyłącz *Allow new users to sign up*. Provider *Email* zostaw.
6. **Authentication → SMTP Settings:** włącz własne SMTP — skrzynka **agencji** (`smtp.gmail.com`, port 465, hasło do aplikacji Google). Bez tego Supabase wysyła tylko kilka maili z resetem hasła na godzinę dla wszystkich restauracji razem.
7. **Authentication → URL Configuration:** *Site URL* = strona agencji; do *Redirect URLs* dopisuj `https://<domena>/panel/` każdej restauracji.
8. **Realtime → Settings:** *Allow public access* **włączone** (kanały `availability:<slug>` są publiczne i niosą wyłącznie datę).
9. **Project Settings → API Keys:** *Project URL*, klucz **publishable**, klucz **secret**. **Connect → Session pooler:** connection string (do backupu i `psql`).
10. Backup: patrz [Backup](#backup-i-przywracanie).

## Nowa restauracja

Od klienta: lista stolików (oznaczenie, miejsca, od ilu osób przy dużych), maks. grupa online, godziny otwarcia, treść zasad, skrzynka Gmail na potwierdzenia, e-mail konta obsługi, pełna nazwa firmy i NIP (do `privacy.html`).

1. Skopiuj `supabase/new_restaurant.sql`, zamień `alticcio` na nowy slug (małe litery, cyfry, myślniki) i wpisz dane klienta. Uruchom.
2. Konto obsługi: Authentication → Users → *Add user* (e-mail + hasło min. 10 znaków, *Auto Confirm*). Potem w SQL Editor:
   ```sql
   insert into public.staff (user_id, restaurant_id)
   select u.id, x.id from auth.users u, public.restaurants x
   where u.email = 'obsluga@example.com' and x.slug = '<slug>';
   ```
3. Redirect URL panelu: `https://<domena>/panel/` (punkt 7 wyżej).
4. Turnstile: Dashboard → Turnstile → *Add widget*, hostnames `<domena>` i `<projekt>.pages.dev`, tryb **Managed**.
5. Strona: skopiuj z Alticcio `build.sh`, `functions/api/reserve.js`, `js/config.js`, `panel/index.html`, `odwolaj/index.html`, `css/booking.css` i sekcję `#booking-app` z `index.html`. W `config.js`: `RESTAURANT_SLUG`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `TURNSTILE_SITE_KEY`, telefon. W `functions/api/reserve.js`: `BRAND` (kolor akcentu, tło, podpis). Logo i tytuł w `panel/` i `odwolaj/`.
6. Gmail restauracji: weryfikacja dwuetapowa → https://myaccount.google.com/apppasswords → 16 liter = `SMTP_PASSWORD`.
7. Cloudflare Pages — projekt z repo:

   | Ustawienie | Wartość |
   |---|---|
   | Root directory | `clients/<branża>/active/<klient>` |
   | Build command | `sh build.sh` |
   | Build output directory | `dist` |
   | Build watch paths (Include) | `clients/<branża>/active/<klient>/*` **oraz** `rsaas/*` |

   *Settings → Variables and Secrets* (Production **i** Preview, typ **Secret**):

   | Nazwa | Wartość |
   |---|---|
   | `RESTAURANT_SLUG` | slug z kroku 1 |
   | `SUPABASE_URL` | `https://<projekt>.supabase.co` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` |
   | `TURNSTILE_SECRET_KEY` | sekret widgetu |
   | `SMTP_USER` | Gmail restauracji |
   | `SMTP_PASSWORD` | hasło do aplikacji |

8. Security → WAF → *Rate limiting rules* (strefa domeny): `/api/reserve`, np. 10 żądań / 10 s na IP → Block. Darmowa reguła; uzupełnia Turnstile i limit na numer.
9. `privacy.html` restauracji: podwykonawcy Supabase (Frankfurt), Cloudflare, Google. Usuń `noindex` z `index.html` i `privacy.html` (panel i `/odwolaj/` zostają `noindex`).
10. [Sprawdzenie po wdrożeniu](#sprawdzenie-po-wdrożeniu).

## Sprawdzenie po wdrożeniu

- [ ] Sekcja Rezerwacja: kalendarz się wczytuje, są wolne godziny
- [ ] Rezerwacja testowa → „Potwierdzenie wysłaliśmy na …”, mail dochodzi (sprawdź spam), w mailu nazwa i adres **tej** restauracji
- [ ] Link „Odwołaj rezerwację” → `/odwolaj/` → „Tak, odwołaj” → godzina wraca, w panelu „Odwołana przez gościa”
- [ ] Druga karta na tej samej dacie: zajęta godzina znika **bez odświeżania**
- [ ] `/panel/`: logowanie, rezerwacja widoczna, „Na żywo”, anulowanie → godzina wraca u gościa
- [ ] Konto obsługi innej restauracji na tym `/panel/` → „brak dostępu”
- [ ] `https://<domena>/api/reserve` (GET) → `405`
- [ ] `https://<domena>/brief.md`, `/lib/smtp.js`, `/.rsaas/server/smtp.js` → nie pokazują treści
- [ ] Nagłówki `/panel/` i `/odwolaj/`: `x-robots-tag: noindex`, `content-security-policy: frame-ancestors 'none'`
- [ ] Usuń rezerwację testową: `delete from public.reservations where guest_name = 'Test';`

## Backup i przywracanie

Supabase Free **nie robi kopii**. Robi je `.github/workflows/rsaas-backup.yml`: codziennie o 02:40 UTC zrzut `public` + `private` + kont obsługi, gzip, szyfrowanie **age**, artefakt na 30 dni. Ten sam workflow pinguje bazę, żeby projekt nie został uśpiony.

Konfiguracja (raz):
1. Lokalnie: `brew install age && age-keygen -o ~/rsaas-backup.key`. Linia `# public key: age1…` to klucz publiczny. **Plik `~/rsaas-backup.key` trzymaj poza repo** (np. menedżer haseł) — bez niego kopii nie odszyfrujesz.
2. GitHub → repo → Settings → Secrets and variables → Actions:
   secret `RSAAS_DB_URL` (Session pooler), variables `RSAAS_BACKUP_AGE_RECIPIENT`, `RSAAS_SUPABASE_URL`, `RSAAS_PUBLISHABLE_KEY`, `RSAAS_PING_SLUG`.
3. Actions → *RSaaS backup* → *Run workflow* → powinien powstać artefakt.

Przywracanie (np. do nowego projektu):
```bash
age -d -i ~/rsaas-backup.key rsaas-<data>.sql.gz.age | gunzip > rsaas.sql
psql "<connection string nowego projektu>" -v ON_ERROR_STOP=1 -f rsaas.sql
# potem 0003_security_realtime.sql jeszcze raz: publikacja realtime i zadanie pg_cron nie są w zrzucie
```
Raz na kwartał przywróć kopię do pustego projektu testowego i uruchom `booking_test.sql` — kopia, której nikt nie odtworzył, nie jest kopią.

## Kiedy przejść na Supabase Pro

Gdy restauracje płacą abonament i rezerwacje są dla nich ważne. Pro (~25 $/mies. ≈ 100 zł, stała kwota niezależnie od liczby restauracji) daje dzienne backupy z przywracaniem jednym kliknięciem i brak usypiania. Zmiana planu nie wymaga zmian w kodzie. Workflow backupu można zostawić jako drugą kopię.

Limity Free przy kilkunastu restauracjach są daleko: baza 500 MB (rezerwacja ≈ 1 KB, kasowane po 30 dniach), ~200 równoczesnych połączeń realtime, logują się tylko pracownicy.

## Codzienne utrzymanie

**Stoliki, godziny, reguły** — Supabase → Table Editor: `dining_tables`, `opening_hours`, `settings` (filtr po `restaurant_id`), albo zmieniony `new_restaurant.sql` uruchomiony ponownie.
- Stolika z rezerwacjami nie usuwaj — `active = false`.
- ⚠️ Godziny otwarcia są w **dwóch miejscach**: `opening_hours` (rezerwacje) i `index.html` strony (tabela + JSON-LD). Zmieniaj oba.
- Wyłączenie rezerwacji online (np. remont): `update public.restaurants set active = false where slug = '…';` — widget pokaże telefon.

**Odebranie dostępu do panelu:**
`delete from public.staff where restaurant_id = (select id from public.restaurants where slug = '…') and user_id = (select id from auth.users where email = '…');`

**Retencja:** `pg_cron` codziennie o 03:17 UTC usuwa rezerwacje starsze niż `settings.retention_days` danej restauracji. Sprawdzenie: `select * from cron.job;`

**Zmiana wspólnego kodu** (`rsaas/client`, `rsaas/server`): `node --test rsaas/tests/*.test.mjs`, potem push — Pages przebudowuje wszystkie strony z `rsaas/*` w watch paths. Zmiana SQL: nowa migracja `0004_…sql`, testy na projekcie, dopiero potem push kodu, który z niej korzysta.

## Praca lokalna

`rsaas/.env.local` (w `.gitignore`): `RSAAS_DB_URL=postgresql://…` (Session pooler).

```bash
# testy SQL na projekcie (rollback — niczego nie zostawiają)
psql "$RSAAS_DB_URL" -v ON_ERROR_STOP=1 -f rsaas/supabase/tests/booking_test.sql

# testy Node, bez sieci
node --test rsaas/tests/*.test.mjs

# strona lokalnie
cd clients/sklepy/active/alticcio
sh build.sh && npx wrangler pages dev dist            # http://localhost:8788
node ../../../../rsaas/tests/race.mjs http://localhost:8788 2026-12-04 20:00 8 10   # wyścig — tylko na projekcie TESTOWYM, bez SMTP_* w .dev.vars
```

`.dev.vars` strony (w `.gitignore`):
```
RESTAURANT_SLUG=alticcio
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
SMTP_USER=adres@gmail.com
SMTP_PASSWORD=abcdefghijklmnop
```
Klucz Turnstile powyżej to oficjalny klucz **testowy** Cloudflare (przepuszcza każdy token); w `js/config.js` odpowiada mu `1x00000000000000000000AA`. Bez `SMTP_*` wszystko działa, tylko mail nie wychodzi.

## Ograniczenia, o których trzeba pamiętać

- Supabase Free: brak SLA. Przy awarii kalendarz pokazuje komunikat z telefonem restauracji.
- Hasło do aplikacji Google przestaje działać po zmianie hasła konta — wtedy nowe i podmiana sekretu w Cloudflare.
- RODO: zwykłe `@gmail.com` nie ma umowy powierzenia z Google — docelowo Google Workspace (TODO w `privacy.html` restauracji).
- Strefa czasowa widgetu i panelu: `Europe/Warsaw` (`client/format.js`). Restauracja spoza Polski wymaga zmiany.
