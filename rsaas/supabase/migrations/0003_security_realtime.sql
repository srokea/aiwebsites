-- =====================================================================
-- RSaaS — 0003: uprawnienia, RLS, realtime, retencja
--
-- Supabase domyślnie nadaje rolom anon/authenticated prawa do nowych tabel
-- i funkcji w `public`. Tu je świadomie odbieramy i nadajemy tylko to, co potrzebne.
-- Zasada: gość nie dotyka tabel wcale (wszystko przez RPC), obsługa widzi
-- wyłącznie wiersze swoich restauracji.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabele: najpierw zabieramy wszystko, potem nadajemy minimum
-- ---------------------------------------------------------------------
alter table public.restaurants    enable row level security;
alter table public.settings       enable row level security;
alter table public.opening_hours  enable row level security;
alter table public.dining_tables  enable row level security;
alter table public.reservations   enable row level security;
alter table public.staff          enable row level security;

revoke all on public.restaurants, public.settings, public.opening_hours,
              public.dining_tables, public.reservations, public.staff
  from public, anon, authenticated;

-- Rezerwacje: odczyt tylko dla obsługi danej restauracji. Potrzebne, bo Realtime
-- (postgres_changes) sprawdza RLS subskrybenta. Zapis wyłącznie przez funkcje security definer.
-- is_staff jest security definer, więc authenticated nie potrzebuje dostępu do tabeli staff.
grant select on public.reservations to authenticated;
create policy reservations_staff_read on public.reservations
  for select to authenticated
  using (public.is_staff(restaurant_id));

-- Pozostałe tabele: brak jakiegokolwiek bezpośredniego dostępu z API.


-- ---------------------------------------------------------------------
-- Funkcje
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.is_staff(uuid)                          from public, anon, authenticated;
revoke all on function public.my_restaurants()                        from public, anon, authenticated;
revoke all on function public.get_public_config(text)                 from public, anon, authenticated;
revoke all on function public.get_available_slots(text, date, int, int) from public, anon, authenticated;
revoke all on function public.create_reservation(text, uuid, date, text, int, int, text, text, text, text)
                                                                       from public, anon, authenticated;
revoke all on function public.reservation_by_token(text)              from public, anon, authenticated;
revoke all on function public.cancel_reservation_by_token(text)       from public, anon, authenticated;
revoke all on function public.cancel_reservation(uuid)                from public, anon, authenticated;
revoke all on function public.staff_reservations(text, date)          from public, anon, authenticated;

-- Gość (klucz publishable):
grant execute on function public.get_public_config(text)                 to anon, authenticated;
grant execute on function public.get_available_slots(text, date, int, int) to anon, authenticated;
-- Token (64 znaki hex) jest jedynym „hasłem” — odgadnąć go się nie da, więc klucz publiczny wystarczy.
grant execute on function public.reservation_by_token(text)              to anon, authenticated;
grant execute on function public.cancel_reservation_by_token(text)       to anon, authenticated;

-- Obsługa (zalogowana; każda funkcja sama sprawdza restaurację):
grant execute on function public.is_staff(uuid)                to authenticated;
grant execute on function public.my_restaurants()              to authenticated;
grant execute on function public.cancel_reservation(uuid)      to authenticated;
grant execute on function public.staff_reservations(text, date) to authenticated;

-- Tylko funkcja Cloudflare Pages /api/reserve (klucz secret = rola service_role):
grant execute on function public.create_reservation(text, uuid, date, text, int, int, text, text, text, text)
  to service_role;


-- ---------------------------------------------------------------------
-- Realtime dla gości: publiczny kanał „availability:<slug>” każdej restauracji
-- Niesie WYŁĄCZNIE datę, której dotyczy zmiana. Widget na tej dacie
-- pobiera wtedy wolne godziny od nowa.
-- ---------------------------------------------------------------------
create or replace function private.broadcast_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_slug text;
begin
  select s.timezone, x.slug into v_tz, v_slug
  from public.settings s join public.restaurants x on x.id = s.restaurant_id
  where s.restaurant_id = new.restaurant_id;
  begin
    perform realtime.send(
      jsonb_build_object('date', to_char(lower(new.period) at time zone v_tz, 'YYYY-MM-DD')),
      'changed',
      'availability:' || v_slug,
      false
    );
  exception when others then
    -- Brak powiadomienia nie może zablokować rezerwacji ani anulowania.
    raise warning 'availability broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger reservations_broadcast_availability
  after insert or update of status, period on public.reservations
  for each row execute function private.broadcast_availability();


-- ---------------------------------------------------------------------
-- Realtime dla panelu: zmiany w tabeli (filtrowane przez RLS powyżej)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reservations;
  else
    raise notice 'Brak publikacji supabase_realtime — pomijam (środowisko inne niż Supabase).';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Retencja: codziennie o 03:17 UTC usuwamy rezerwacje starsze niż settings.retention_days
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'rsaas-purge-old-reservations',
      '17 3 * * *',
      'select private.purge_old_reservations()'
    );
  else
    raise notice 'pg_cron niedostępny — retencję trzeba uruchamiać ręcznie: select private.purge_old_reservations();';
  end if;
end;
$$;


-- Funkcja triggera powstała po zbiorczym `revoke` powyżej — domykamy.
revoke all on function private.broadcast_availability() from public, anon, authenticated;
