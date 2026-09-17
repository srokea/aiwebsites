-- =====================================================================
-- Alticcio — system rezerwacji stolików
-- 0001: schemat
--
-- Uruchamiaj migracje po kolei (0001 → 0002 → 0003), potem seed.sql.
-- Szczegóły wdrożenia: supabase/SETUP.md
-- =====================================================================

create schema if not exists extensions;
-- btree_gist: pozwala połączyć w jednym constraincie „ten sam stolik” (=)
-- z „nachodzące przedziały czasu” (&&). To on gwarantuje brak podwójnej rezerwacji.
create extension if not exists btree_gist with schema extensions;

-- Funkcje pomocnicze, których nie wystawiamy przez API (PostgREST widzi tylko `public`).
create schema if not exists private;


-- ---------------------------------------------------------------------
-- Ustawienia (jeden wiersz)
-- ---------------------------------------------------------------------
create table public.settings (
  id                    boolean primary key default true check (id),
  timezone              text      not null default 'Europe/Warsaw',
  slot_interval_min     smallint  not null default 30  check (slot_interval_min in (15, 30, 60)),
  durations_min         smallint[] not null default '{90,120,150,180}'
                        check (cardinality(durations_min) between 1 and 8 and 30 <= all (durations_min) and 480 >= all (durations_min)),
  default_duration_min  smallint  not null default 120,
  max_party             smallint  not null default 8   check (max_party between 1 and 50),
  booking_horizon_days  smallint  not null default 60  check (booking_horizon_days between 1 and 365),
  min_lead_min          smallint  not null default 60  check (min_lead_min between 0 and 2880),
  max_active_per_phone  smallint  not null default 2   check (max_active_per_phone between 1 and 20),
  retention_days        smallint  not null default 30  check (retention_days between 1 and 365),
  rules_text            text      not null default '',
  check (default_duration_min = any (durations_min))
);

comment on table public.settings is
  'Reguły rezerwacji. Jeden wiersz. Czytelne publicznie — nie trzymać tu nic poufnego.';


-- ---------------------------------------------------------------------
-- Godziny otwarcia. Brak wiersza dla dnia = zamknięte.
-- Minuty od północy czasu lokalnego; closes_min = 1440 oznacza 00:00 następnego dnia.
-- ---------------------------------------------------------------------
create table public.opening_hours (
  weekday     smallint primary key check (weekday between 1 and 7),   -- ISO: 1 = poniedziałek
  opens_min   smallint not null check (opens_min between 0 and 1439),
  closes_min  smallint not null check (closes_min between 1 and 1440),
  check (closes_min > opens_min)
);


-- ---------------------------------------------------------------------
-- Stoliki
-- ---------------------------------------------------------------------
create table public.dining_tables (
  id         smallint generated always as identity primary key,
  label      text     not null unique check (char_length(label) between 1 and 20),
  seats      smallint not null check (seats between 1 and 30),
  min_party  smallint not null default 1 check (min_party >= 1),
  active     boolean  not null default true,
  sort       smallint not null default 0,
  check (min_party <= seats)
);

comment on column public.dining_tables.min_party is
  'Najmniejsza grupa, jaką system posadzi przy tym stoliku (np. 3 dla sześcioosobowego, żeby para go nie zajęła).';


-- ---------------------------------------------------------------------
-- Rezerwacje
-- ---------------------------------------------------------------------
create table public.reservations (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique,     -- idempotencja: ponowiona wysyłka nie tworzy duplikatu
  table_id      smallint not null references public.dining_tables (id),
  period        tstzrange not null
                check (not isempty(period) and lower_inc(period) and not upper_inc(period)),
  party_size    smallint not null check (party_size between 1 and 50),
  guest_name    text not null check (char_length(btrim(guest_name)) between 1 and 80),
  guest_phone   text not null check (guest_phone ~ '^\+[1-9][0-9]{7,14}$'),
  guest_email   text check (guest_email is null
                            or (char_length(guest_email) <= 254 and guest_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  comment       text check (comment is null or char_length(comment) <= 500),
  status        text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  cancelled_by  uuid,

  -- Sedno systemu: dwie POTWIERDZONE rezerwacje tego samego stolika nie mogą nachodzić na siebie.
  -- Przedziały [start, koniec) — rezerwacja kończąca się o 20:00 nie blokuje startu o 20:00.
  constraint reservations_no_overlap
    exclude using gist (table_id with =, period with &&) where (status = 'confirmed')
);

create index reservations_period_idx on public.reservations using gist (period);
create index reservations_phone_idx  on public.reservations (guest_phone) where status = 'confirmed';


-- ---------------------------------------------------------------------
-- Obsługa (konta z dostępem do panelu)
-- ---------------------------------------------------------------------
create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
