-- =====================================================================
-- RSaaS — wspólny system rezerwacji stolików dla wielu restauracji
-- 0001: schemat
--
-- Powstał z systemu Alticcio (migracje 0001–0004), z dodanym wymiarem
-- „restauracja”. Uruchamiaj po kolei: 0001 → 0002 → 0003, potem
-- new_restaurant.sql dla każdej restauracji. Szczegóły: rsaas/README.md
-- =====================================================================

create schema if not exists extensions;
-- btree_gist: pozwala połączyć w jednym constraincie „ten sam stolik” (=)
-- z „nachodzące przedziały czasu” (&&). To on gwarantuje brak podwójnej rezerwacji.
create extension if not exists btree_gist with schema extensions;

-- Funkcje pomocnicze, których nie wystawiamy przez API (PostgREST widzi tylko `public`).
create schema if not exists private;


-- ---------------------------------------------------------------------
-- Restauracje
-- slug to publiczny identyfikator, który strona restauracji ma w js/config.js
-- (np. 'alticcio'). Nazwa, adres i telefon trafiają do widgetu i maila.
-- ---------------------------------------------------------------------
create table public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  address     text not null default '' check (char_length(address) <= 200),
  phone       text not null default '' check (char_length(phone) <= 30),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.restaurants.active is
  'false = widget pokazuje „rezerwacje online wyłączone”, nowe rezerwacje są odrzucane. Dane zostają.';


-- ---------------------------------------------------------------------
-- Ustawienia — jeden wiersz na restaurację
-- ---------------------------------------------------------------------
create table public.settings (
  restaurant_id           uuid primary key references public.restaurants (id) on delete cascade,
  timezone                text      not null default 'Europe/Warsaw',
  slot_interval_min       smallint  not null default 30  check (slot_interval_min in (15, 30, 60)),
  durations_min           smallint[] not null default '{90,120,150,180}'
                          check (cardinality(durations_min) between 1 and 8 and 30 <= all (durations_min) and 480 >= all (durations_min)),
  default_duration_min    smallint  not null default 120,
  max_party               smallint  not null default 8   check (max_party between 1 and 50),
  booking_horizon_days    smallint  not null default 60  check (booking_horizon_days between 1 and 365),
  min_lead_min            smallint  not null default 60  check (min_lead_min between 0 and 2880),
  max_active_per_phone    smallint  not null default 2   check (max_active_per_phone between 1 and 20),
  retention_days          smallint  not null default 30  check (retention_days between 1 and 365),
  guest_cancel_min_before smallint  not null default 120 check (guest_cancel_min_before between 0 and 2880),
  rules_text              text      not null default '',
  check (default_duration_min = any (durations_min))
);

comment on table public.settings is
  'Reguły rezerwacji, jeden wiersz na restaurację. Widget gościa dostaje je przez get_public_config — nie trzymać tu nic poufnego.';


-- ---------------------------------------------------------------------
-- Godziny otwarcia. Brak wiersza dla dnia = zamknięte.
-- Minuty od północy czasu lokalnego; closes_min = 1440 oznacza 00:00 następnego dnia.
-- ---------------------------------------------------------------------
create table public.opening_hours (
  restaurant_id uuid     not null references public.restaurants (id) on delete cascade,
  weekday       smallint not null check (weekday between 1 and 7),   -- ISO: 1 = poniedziałek
  opens_min     smallint not null check (opens_min between 0 and 1439),
  closes_min    smallint not null check (closes_min between 1 and 1440),
  primary key (restaurant_id, weekday),
  check (closes_min > opens_min)
);


-- ---------------------------------------------------------------------
-- Stoliki
-- ---------------------------------------------------------------------
create table public.dining_tables (
  id            smallint generated always as identity primary key,
  restaurant_id uuid     not null references public.restaurants (id) on delete cascade,
  label         text     not null check (char_length(label) between 1 and 20),
  seats         smallint not null check (seats between 1 and 30),
  min_party     smallint not null default 1 check (min_party >= 1),
  active        boolean  not null default true,
  sort          smallint not null default 0,
  unique (restaurant_id, label),
  -- cel złożonego klucza obcego z reservations: rezerwacja nie wskaże stolika innej restauracji
  unique (restaurant_id, id),
  check (min_party <= seats)
);

comment on column public.dining_tables.min_party is
  'Najmniejsza grupa, jaką system posadzi przy tym stoliku (np. 3 dla sześcioosobowego, żeby para go nie zajęła).';


-- ---------------------------------------------------------------------
-- Rezerwacje
-- ---------------------------------------------------------------------
create table public.reservations (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants (id) on delete cascade,
  request_id        uuid not null unique,     -- idempotencja: ponowiona wysyłka nie tworzy duplikatu
  table_id          smallint not null,
  period            tstzrange not null
                    check (not isempty(period) and lower_inc(period) and not upper_inc(period)),
  party_size        smallint not null check (party_size between 1 and 50),
  guest_name        text not null check (char_length(btrim(guest_name)) between 1 and 80),
  guest_phone       text not null check (guest_phone ~ '^\+[1-9][0-9]{7,14}$'),
  guest_email       text check (guest_email is null
                                or (char_length(guest_email) <= 254 and guest_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  comment           text check (comment is null or char_length(comment) <= 500),
  status            text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      uuid,
  cancelled_via     text check (cancelled_via in ('staff', 'guest')),
  cancel_token_hash bytea unique,

  foreign key (restaurant_id, table_id) references public.dining_tables (restaurant_id, id),

  -- Sedno systemu: dwie POTWIERDZONE rezerwacje tego samego stolika nie mogą nachodzić na siebie.
  -- Przedziały [start, koniec) — rezerwacja kończąca się o 20:00 nie blokuje startu o 20:00.
  -- table_id jest globalnie unikalne, więc constraint działa tak samo przy wielu restauracjach.
  constraint reservations_no_overlap
    exclude using gist (table_id with =, period with &&) where (status = 'confirmed')
);

comment on column public.reservations.cancel_token_hash is
  'sha256(token) z linku „Odwołaj” w mailu. Samego tokenu baza nie przechowuje.';

create index reservations_restaurant_period_idx on public.reservations using gist (restaurant_id, period);
create index reservations_phone_idx on public.reservations (restaurant_id, guest_phone) where status = 'confirmed';


-- ---------------------------------------------------------------------
-- Obsługa: kto ma dostęp do panelu której restauracji
-- Jedna osoba może obsługiwać kilka restauracji (osobne wiersze).
-- ---------------------------------------------------------------------
create table public.staff (
  user_id       uuid not null references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

create index staff_restaurant_idx on public.staff (restaurant_id);
