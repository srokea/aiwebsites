# System rezerwacji Alticcio — wdrożenie i utrzymanie

Stack: statyczna strona + Supabase (baza, realtime, logowanie) + Cloudflare Pages (hosting, funkcja `/api/reserve`, Turnstile). Koszt: 0 zł na darmowych planach.

```
gość ── index.html (#booking-app) ── js/booking.js
          ├─ odczyt wolnych godzin ──────── Supabase (klucz publishable, RPC get_available_slots)
          ├─ realtime „availability” ────── Supabase (kanał broadcast, niesie tylko datę)
          └─ POST /api/reserve ──────────── functions/api/reserve.js
                                              ├─ Turnstile (czy to człowiek)
                                              └─ Supabase RPC create_reservation (klucz secret)
obsługa ── /panel/ ── js/panel.js ───────── Supabase (logowanie, RLS: tylko tabela staff)
```

Kluczem publishable **nie da się** czytać rezerwacji ani ich tworzyć — tylko pobrać wolne godziny.
Podwójną rezerwację blokuje constraint w bazie (`reservations_no_overlap`), nie kod strony.

---

## Przed startem — od klienta

- [ ] Lista stolików: oznaczenie + liczba miejsc (+ od ilu osób sadzać przy dużych stołach)
- [ ] Maks. grupa online (domyślnie 8; największy stolik musi mieć co najmniej tyle miejsc)
- [ ] Treść „Zasad rezerwacji”
- [ ] Reguły: rezerwacja kończy się przed zamknięciem · min. 60 min wyprzedzenia · 60 dni naprzód · 2 aktywne rezerwacje na numer · usunięcie danych 30 dni po wizycie
- [ ] E-mail konta obsługi
- [ ] Pełna nazwa firmy i NIP (do `privacy.html`)

## 1. Supabase

1. Nowy projekt, **region: Central EU (Frankfurt)**. Polityka prywatności na to się powołuje.
2. Organization → Legal Documents → zaakceptuj **DPA** (umowa powierzenia).
3. **SQL Editor**, po kolei, każdy plik w całości:
   1. `migrations/0001_schema.sql`
   2. `migrations/0002_functions.sql`
   3. `migrations/0003_security_realtime.sql`
   4. `seed.sql` — **najpierw podmień przykładowe stoliki i reguły na dane klienta**
4. Uruchom `tests/booking_test.sql`. Musi pojawić się komunikat `WSZYSTKIE TESTY OK`.
   Test kończy się `rollback`, więc niczego nie zostawia w bazie.
5. **Authentication → Sign In / Providers:** wyłącz *Allow new users to sign up*. Provider *Email* zostaw włączony.
6. **Authentication → URL Configuration:** *Site URL* = `https://<domena>`, do *Redirect URLs* dodaj `https://<domena>/panel/`
   (link do zmiany hasła wraca do panelu).
7. **Konto obsługi:** Authentication → Users → *Add user* → e-mail + hasło (min. 10 znaków), zaznacz *Auto Confirm*. Potem w SQL Editor:
   ```sql
   insert into public.staff (user_id)
   select id from auth.users where email = 'wlasciciel@example.com';
   ```
8. **Realtime → Settings:** opcja *Allow public access* musi być **włączona** (domyślnie jest).
   Kanał `availability` jest publiczny i niesie wyłącznie datę.
9. **Project Settings → API Keys:** skopiuj *Project URL*, klucz **publishable** i klucz **secret**.

## 2. Cloudflare Turnstile

Dashboard → Turnstile → *Add widget*:
- Hostnames: `<domena>` oraz `<projekt>.pages.dev`
- Widget mode: **Managed**

Skopiuj *Site Key* i *Secret Key*.

## 3. Konfiguracja w repo

`js/config.js` — trzy publiczne wartości:
```js
export const SUPABASE_URL = 'https://<projekt>.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_…';
export const TURNSTILE_SITE_KEY = '0x4AAAA…';     // produkcyjny, nie testowy 1x000…AA
```
**Sekretów nie wpisuje się do żadnego pliku w repo.** `build.sh` przerywa build, jeśli zobaczy coś podobnego w `dist/`.

## 4. Cloudflare Pages

*Workers & Pages → Create → Pages → Connect to Git*, to repozytorium:

| Ustawienie | Wartość |
|---|---|
| Root directory | `clients/sklepy/active/alticcio` |
| Build command | `sh build.sh` |
| Build output directory | `dist` |
| Build watch paths (Include) | `clients/sklepy/active/alticcio/*` (żeby commity innych klientów nie budowały tej strony) |

*Settings → Variables and Secrets* (Production **i** Preview, typ **Secret**):

| Nazwa | Wartość |
|---|---|
| `SUPABASE_URL` | `https://<projekt>.supabase.co` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` (starszy klucz `service_role` też działa) |
| `TURNSTILE_SECRET_KEY` | sekret widgetu Turnstile |

Potem *Custom domains* → podpięcie domeny. Na koniec usuń `<meta name="robots" content="noindex">` z `index.html` i `privacy.html` (panel ma zostać `noindex`).

## 5. Sprawdzenie po wdrożeniu

- [ ] Strona → sekcja Rezerwacja: kalendarz się wczytuje, są wolne godziny
- [ ] Rezerwacja testowa przechodzi, pojawia się potwierdzenie
- [ ] Druga karta na tej samej dacie: zajęta godzina znika **bez odświeżania**
- [ ] `/panel/`: logowanie, rezerwacja widoczna, znacznik „Na żywo”
- [ ] Anulowanie w panelu → godzina wraca u gościa
- [ ] `https://<domena>/api/reserve` w przeglądarce (GET) → `405`
- [ ] `https://<domena>/brief.md` → nie pokazuje briefu
- [ ] Nagłówki `/panel/`: `x-robots-tag: noindex`, `content-security-policy: frame-ancestors 'none'`
- [ ] Usuń rezerwację testową (SQL niżej)

---

## Praca lokalna

Plik `.dev.vars` w folderze klienta (jest w `.gitignore`):
```
SUPABASE_URL=https://<projekt-testowy>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_…
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```
Klucz Turnstile powyżej to oficjalny klucz **testowy** Cloudflare — przepuszcza każdy token. W `js/config.js` odpowiada mu site key `1x00000000000000000000AA`.

```bash
cd clients/sklepy/active/alticcio
sh build.sh && npx wrangler pages dev dist            # http://localhost:8788
node --test tests/reserve.test.mjs                    # funkcja /api/reserve, bez sieci
node tests/race.mjs http://localhost:8788 2026-10-02 20:00 8 10   # wyścig — tylko na projekcie TESTOWYM
```

## Codzienne utrzymanie

**Stoliki, godziny otwarcia, reguły** — Supabase → Table Editor: `dining_tables`, `opening_hours`, `settings`.
- Stolika nie usuwaj, jeśli ma rezerwacje — ustaw `active = false`.
- ⚠️ Godziny otwarcia są w **dwóch miejscach**: `opening_hours` (rezerwacje) i `index.html` (tabela godzin + JSON-LD). Zmieniaj oba.

**Odebranie dostępu do panelu:** `delete from public.staff where user_id = (select id from auth.users where email = '…');`

**Usunięcie rezerwacji testowej:** `delete from public.reservations where guest_name = 'Test';`

**Retencja:** `pg_cron` codziennie o 03:17 UTC usuwa rezerwacje starsze niż `settings.retention_days` po wizycie. Sprawdzenie: `select * from cron.job;`

## Ograniczenia darmowych planów

- **Supabase Free wstrzymuje projekt po 7 dniach bez żadnych zapytań.** Każde wejście gościa w sekcję rezerwacji to zapytanie, więc przy działającej restauracji to mało realne. Gdyby się zdarzyło, kalendarz pokaże komunikat z numerem telefonu. Wznowienie: dashboard → *Restore project*.
- **Brak automatycznych kopii zapasowych na Free.** Raz w tygodniu: Table Editor → `reservations` → *Export to CSV* albo `pg_dump` przez connection string. Gdy system stanie się krytyczny dla lokalu — plan Pro (dzienne backupy).
- **Wysyłka e-maili Supabase Auth** (link do zmiany hasła) ma niski limit na godzinę. Dla jednego konta obsługi wystarcza.
