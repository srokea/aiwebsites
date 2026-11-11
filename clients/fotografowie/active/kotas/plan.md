# Plan: zarządzanie kontem i hasłem panelu

## Stan obecny

Każda instancja klienta ma dokładnie jedno hasło do panelu, ustawione raz
przez agencję jako sekret workera (`wrangler secret put ADMIN_PASSWORD`).
Logowanie (`worker/auth.js`) porównuje hasło z formularza z tym sekretem
i wystawia podpisany JWT ważny 24h. Nie ma:

- sposobu, żeby klient sam zmienił hasło (musi pisać do agencji),
- procedury "zapomniałem hasła" (agencja ręcznie robi `wrangler secret put` od nowa),
- więcej niż jednego konta na instancję (jeden fotograf = jedno wspólne hasło,
  nawet jeśli ma asystenta),
- żadnego zabezpieczenia przed próbami zgadywania hasła (brak rate limitu na
  `POST /api/auth`).

To wystarczało przy garstce klientów, ale przy skalowaniu agencji każda
zmiana hasła to ręczna interwencja przez CLI — warto to rozwiązać zanim
zacznie boleć.

## Cel

Klient loguje się do panelu i sam zarządza swoim hasłem — bez pisania do
agencji, bez czekania na `wrangler secret put`. Zachowujemy zero-frameworkową,
zero-npm filozofię szablonu.

## Zakres (i czego świadomie NIE robimy teraz)

W zakresie:
- zmiana hasła z poziomu panelu (zalogowany użytkownik),
- reset hasła bez dostępu do panelu ("zapomniałem hasła"),
- podstawowy rate limit na logowanie.

Poza zakresem na razie (YAGNI, dopóki nie zgłosi tego realny klient):
- wiele kont per instancja (rola/uprawnienia) — jeśli klient naprawdę
  potrzebuje osobnego konta dla asystenta, tabela `users` poniżej już to
  udźwignie, ale UI do zarządzania wieloma kontami budujemy dopiero, gdy
  ktoś tego użyje.
- 2FA — rozważyć dopiero jeśli pojawi się incydent bezpieczeństwa albo
  klient wyraźnie o to poprosi.

## Fazy

### Faza 1 — hasło w D1 zamiast w env var

Dziś `ADMIN_PASSWORD` to sekret workera — zmiana wymaga redeploya/CLI.
Przenosimy je do bazy, żeby worker mógł je zmieniać sam.

**Schemat** (dopisać do `schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,   -- PBKDF2 (Web Crypto, patrz niżej), nie plaintext
  password_salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Jedna instancja = jeden wiersz w `users` (id stały, np. `'admin'`) na razie —
to i tak już jest gotowe pod wiele kont później, bez migracji schematu.

**Hashowanie**: PBKDF2 przez `crypto.subtle.deriveBits`, dostępne natywnie
w Workers (ten sam Web Crypto co już używa `auth.js` do HMAC). Zero
zewnętrznych bibliotek — zgodnie z zasadą szablonu. Sól per-użytkownik,
≥100k iteracji.

**Migracja z env var**: `checkPassword()` najpierw sprawdza `users` w D1;
jeśli tabela jest pusta (świeżo wdrożona instancja albo instancja sprzed tej
zmiany), fallback na `env.ADMIN_PASSWORD` jak dziś — i przy pierwszym udanym
logowaniu tym hasłem, zapisuje je (zahaszowane) do `users`, żeby od tej pory
już stamtąd korzystać. Żadna istniejąca instancja się nie wywala, deploy nie
wymaga ręcznej migracji danych.

### Faza 2 — zmiana hasła z panelu

Nowy endpoint chroniony tokenem:

```
POST /api/auth/password   { currentPassword, newPassword }
```

Sprawdza `currentPassword` przez `checkPassword()`, waliduje `newPassword`
(min. 8 znaków — trzymajmy próg niski, to nie jest bank, ale jakiś sens
musi być), zapisuje nowy hash do `users`, unieważnia stare tokeny (patrz
"Sesje" niżej).

Panel: sekcja "Ustawienia strony" (już istnieje dla Szkatulskiego — tło
hero; to naturalne miejsce, żeby dodać też zmianę hasła) dostaje formularz:
obecne hasło / nowe hasło / powtórz nowe hasło.

### Faza 3 — reset hasła bez dostępu do panelu

Najprostsza wersja bez infrastruktury e-mail: **agencja zostaje fallbackiem**,
ale przez jeden endpoint zamiast ręcznego `wrangler secret put`:

```
POST /api/auth/reset-request   -- generuje jednorazowy kod, loguje w Workers Logs
```

Agencja (mając dostęp do `wrangler tail`) odczytuje kod i przekazuje go
klientowi telefonicznie/mailowo, klient wpisuje kod + nowe hasło w panelu.
To nie jest eleganckie, ale nie wymaga dochodzenia usługi e-mail (Resend/SES)
do szablonu, który ma zero zależności zewnętrznych poza Cloudflare.

Jeśli w przyszłości agencja doda wysyłkę maili do innej funkcji szablonu
(np. powiadomienia o nowym zapytaniu z formularza), warto wrócić do tego
punktu i zrobić prawdziwy "zapomniałem hasła" mailem zamiast przez agencję.

### Faza 4 — rate limit logowania

`POST /api/auth` bez ograniczeń pozwala na brute-force. Prosty licznik
w D1 (albo Cloudflare Rate Limiting binding, jeśli plan to obejmuje):
5 nieudanych prób na IP / 15 minut, potem 429. Niezależna od faz 1–3,
można wdrożyć od razu.

## Co się nie zmienia

- Panel admina zostaje jednym samodzielnym plikiem HTML (zero osobnych
  `admin.css`/`admin.js`) — zmiana hasła to kolejna sekcja w tym samym pliku,
  nie nowy moduł.
- JWT (`createToken`/`verifyToken`) zostaje bez zmian — zmienia się tylko
  źródło prawdy o haśle, nie mechanizm sesji.
- Zero nowych zależności npm. PBKDF2 i generowanie kodów resetu idą przez
  Web Crypto, tak jak dzisiejszy HMAC.

## Kolejność wdrożenia

Faza 1 jest fundamentem (bez niej Faza 2 nie ma czego zmieniać) i jest
w pełni wsteczna kompatybilna — można ją wdrożyć od razu, do każdej
przyszłej nowej instancji, bez ryzyka dla istniejących klientów. Fazy 2–4
dokładać pojedynczo, każda to osobny, mały PR.
