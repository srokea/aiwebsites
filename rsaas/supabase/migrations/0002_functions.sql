-- =====================================================================
-- RSaaS — 0002: funkcje
--
-- Każda funkcja `security definer` ma `set search_path = ''` i pełne nazwy
-- (public.x, private.x) — przy `security definer` to wymóg bezpieczeństwa, nie styl.
--
-- Restaurację wskazuje:
--   · gość          → slug (jawny, z js/config.js strony),
--   · /api/reserve  → slug ze zmiennej środowiskowej strony (RESTAURANT_SLUG), nigdy z treści żądania,
--   · panel         → slug + sprawdzenie, czy zalogowany jest w public.staff tej restauracji,
--   · link z maila  → token (jednoznacznie wskazuje jedną rezerwację).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Pomocnicze
-- ---------------------------------------------------------------------
create or replace function private.restaurant_by_slug(p_slug text)
returns public.restaurants
language sql stable
set search_path = ''
as $$
  select r.* from public.restaurants r where r.slug = p_slug;
$$;


create or replace function private.slot_period(
  p_date date, p_start_min int, p_duration_min int, p_tz text
) returns tstzrange
language sql stable
set search_path = ''
as $$
  select tstzrange(
    (p_date::timestamp + make_interval(mins => p_start_min)) at time zone p_tz,
    ((p_date::timestamp + make_interval(mins => p_start_min)) at time zone p_tz)
      + make_interval(mins => p_duration_min),
    '[)'
  );
$$;


-- Czy termin spełnia reguły restauracji. null = tak, inaczej kod błędu.
create or replace function private.slot_error(
  p_restaurant uuid, p_date date, p_start_min int, p_duration_min int, p_party int, p_now timestamptz
) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  s        public.settings;
  oh       public.opening_hours;
  v_period tstzrange;
  v_today  date;
begin
  select * into s from public.settings where restaurant_id = p_restaurant;
  if not found then
    return 'not_configured';
  end if;

  if p_date is null or p_start_min is null or p_duration_min is null or p_party is null then
    return 'invalid';
  end if;
  if not (p_duration_min = any (s.durations_min)) then
    return 'invalid_duration';
  end if;
  if p_party < 1 or p_party > s.max_party then
    return 'invalid_party';
  end if;

  select * into oh from public.opening_hours
   where restaurant_id = p_restaurant and weekday = extract(isodow from p_date);
  if not found then
    return 'closed';
  end if;

  if p_start_min < oh.opens_min
     or (p_start_min - oh.opens_min) % s.slot_interval_min <> 0 then
    return 'outside_hours';
  end if;

  v_period := private.slot_period(p_date, p_start_min, p_duration_min, s.timezone);

  if upper(v_period) > (p_date::timestamp + make_interval(mins => oh.closes_min)) at time zone s.timezone then
    return 'outside_hours';
  end if;

  v_today := (p_now at time zone s.timezone)::date;
  if p_date > v_today + s.booking_horizon_days then
    return 'beyond_horizon';
  end if;

  if lower(v_period) < p_now + make_interval(mins => s.min_lead_min) then
    return 'too_soon';
  end if;

  return null;
end;
$$;


-- Wolne stoliki tej restauracji dla przedziału i grupy; najmniejszy pasujący pierwszy.
create or replace function private.free_tables(p_restaurant uuid, p_period tstzrange, p_party int)
returns setof public.dining_tables
language sql stable
set search_path = ''
as $$
  select t.*
  from public.dining_tables t
  where t.restaurant_id = p_restaurant
    and t.active
    and p_party between t.min_party and t.seats
    and not exists (
      select 1 from public.reservations r
      where r.table_id = t.id
        and r.status = 'confirmed'
        and r.period && p_period
    )
  order by t.seats, t.sort, t.id;
$$;


create or replace function private.reservation_json(r public.reservations)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',         r.id,
    'date',       to_char(lower(r.period) at time zone s.timezone, 'YYYY-MM-DD'),
    'time',       to_char(lower(r.period) at time zone s.timezone, 'HH24:MI'),
    'end_time',   to_char(upper(r.period) at time zone s.timezone, 'HH24:MI'),
    'party_size', r.party_size,
    'guest_name', r.guest_name
  )
  from public.settings s where s.restaurant_id = r.restaurant_id;
$$;


create or replace function private.restaurant_json(p_restaurant uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('name', x.name, 'address', x.address, 'phone', x.phone)
  from public.restaurants x where x.id = p_restaurant;
$$;


-- Widok rezerwacji dla gościa z linku: to samo co reservation_json + stan odwołania.
create or replace function private.guest_view(r public.reservations, p_now timestamptz)
returns jsonb
language sql stable
set search_path = ''
as $$
  select private.reservation_json(r) || jsonb_build_object(
    'status',        r.status,
    'is_past',       lower(r.period) <= p_now,
    'cancellable',   r.status = 'confirmed'
                     and p_now < lower(r.period) - make_interval(mins => s.guest_cancel_min_before),
    'cancel_min_before', s.guest_cancel_min_before,
    'deadline_date', to_char((lower(r.period) - make_interval(mins => s.guest_cancel_min_before)) at time zone s.timezone, 'YYYY-MM-DD'),
    'deadline_time', to_char((lower(r.period) - make_interval(mins => s.guest_cancel_min_before)) at time zone s.timezone, 'HH24:MI')
  )
  from public.settings s where s.restaurant_id = r.restaurant_id;
$$;


-- 64 znaki hex → sha256; cokolwiek innego → null (nie pasuje do żadnej rezerwacji).
create or replace function private.token_hash(p_token text)
returns bytea
language sql immutable
set search_path = ''
as $$
  select case when p_token ~ '^[0-9a-f]{64}$' then sha256(convert_to(p_token, 'UTF8')) end;
$$;


-- ---------------------------------------------------------------------
-- Obsługa
-- ---------------------------------------------------------------------
create or replace function public.is_staff(p_restaurant uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and restaurant_id = p_restaurant
  );
$$;


-- Restauracje, do których zalogowany ma dostęp. Panel sprawdza, czy jest wśród nich jego slug.
create or replace function public.my_restaurants()
returns table (id uuid, slug text, name text)
language sql stable
security definer
set search_path = ''
as $$
  select r.id, r.slug, r.name
  from public.staff st
  join public.restaurants r on r.id = st.restaurant_id
  where st.user_id = auth.uid()
  order by r.name;
$$;


-- ---------------------------------------------------------------------
-- public.get_public_config — wszystko, czego widget gościa potrzebuje na start
-- Błąd: not_found (zły slug).
-- ---------------------------------------------------------------------
create or replace function public.get_public_config(p_slug text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  x public.restaurants;
  s public.settings;
begin
  x := private.restaurant_by_slug(p_slug);
  if x.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into s from public.settings where restaurant_id = x.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'restaurant', jsonb_build_object(
      'id', x.id, 'name', x.name, 'address', x.address, 'phone', x.phone, 'active', x.active
    ),
    'settings', jsonb_build_object(
      'durations_min',        s.durations_min,
      'default_duration_min', s.default_duration_min,
      'max_party',            s.max_party,
      'booking_horizon_days', s.booking_horizon_days,
      'max_active_per_phone', s.max_active_per_phone,
      'rules_text',           s.rules_text
    ),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_min', h.opens_min, 'closes_min', h.closes_min)
                       order by h.weekday)
      from public.opening_hours h where h.restaurant_id = x.id
    ), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- public.get_available_slots — wolne godziny startu dla dnia, grupy i czasu
-- ---------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_slug text, p_date date, p_party int, p_duration int
) returns table (start_time text)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  x  public.restaurants;
  s  public.settings;
  oh public.opening_hours;
  m  int;
begin
  x := private.restaurant_by_slug(p_slug);
  if x.id is null or not x.active then
    return;
  end if;
  select * into s from public.settings where restaurant_id = x.id;
  select * into oh from public.opening_hours where restaurant_id = x.id and weekday = extract(isodow from p_date);
  if s is null or oh is null or p_party is null or p_duration is null then
    return;
  end if;

  for m in select generate_series(oh.opens_min::int, oh.closes_min::int - p_duration, s.slot_interval_min::int)
  loop
    if private.slot_error(x.id, p_date, m, p_duration, p_party, now()) is null
       and exists (select 1 from private.free_tables(x.id, private.slot_period(p_date, m, p_duration, s.timezone), p_party))
    then
      start_time := lpad((m / 60)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0');
      return next;
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- public.create_reservation — woła WYŁĄCZNIE /api/reserve (service_role)
--
-- Odpowiedź:
--   { ok: true, created: true,  reservation, restaurant, cancel_token, cancel_min_before, cancellable }
--   { ok: true, created: false, reservation, restaurant }   ← ponowiona wysyłka, bez tokenu (bez drugiego maila)
--   { ok: false, error }  ← invalid · not_found · closed_online · not_configured · invalid_duration ·
--                           invalid_party · closed · outside_hours · beyond_horizon · too_soon · limit · slot_taken
-- ---------------------------------------------------------------------
create or replace function public.create_reservation(
  p_slug       text,
  p_request_id uuid,
  p_date       date,
  p_time       text,
  p_party      int,
  p_duration   int,
  p_name       text,
  p_phone      text,
  p_email      text default null,
  p_comment    text default null
) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  x         public.restaurants;
  s         public.settings;
  v_row     public.reservations;
  v_start   int;
  v_err     text;
  v_period  tstzrange;
  v_active  int;
  v_token   text;
  t         record;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  x := private.restaurant_by_slug(p_slug);
  if x.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Ta sama próba wysłana drugi raz (np. zerwane połączenie) → ta sama rezerwacja, bez tokenu.
  select * into v_row from public.reservations where request_id = p_request_id;
  if found then
    if v_row.restaurant_id <> x.id then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    return jsonb_build_object('ok', true, 'created', false,
      'reservation', private.reservation_json(v_row), 'restaurant', private.restaurant_json(x.id));
  end if;

  if not x.active then
    return jsonb_build_object('ok', false, 'error', 'closed_online');
  end if;

  select * into s from public.settings where restaurant_id = x.id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_configured');
  end if;

  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_start := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;

  v_err := private.slot_error(x.id, p_date, v_start, p_duration, p_party, now());
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  p_name    := nullif(btrim(p_name), '');
  p_phone   := btrim(p_phone);
  p_email   := nullif(lower(btrim(p_email)), '');
  p_comment := nullif(btrim(p_comment), '');

  if p_name is null or char_length(p_name) > 80
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or p_email is null or char_length(p_email) > 254
     or p_email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
     or (p_comment is not null and char_length(p_comment) > 500)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Limit aktywnych rezerwacji na numer, osobno w każdej restauracji. Blokada doradcza
  -- serializuje równoległe próby z tego samego numeru, żeby nie dało się obejść limitu wyścigiem.
  perform pg_advisory_xact_lock(hashtextextended('reservation-phone:' || x.id::text || ':' || p_phone, 0));
  select count(*) into v_active
  from public.reservations
  where restaurant_id = x.id and guest_phone = p_phone and status = 'confirmed' and upper(period) > now();
  if v_active >= s.max_active_per_phone then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;

  v_period := private.slot_period(p_date, v_start, p_duration, s.timezone);

  -- 64 znaki hex z dwóch losowych UUID (244 bity losowości).
  v_token := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');

  -- Próbujemy kolejne pasujące stoliki. Jeśli w międzyczasie ktoś zajął stolik,
  -- constraint wykluczający rzuci exclusion_violation i przechodzimy do następnego.
  for t in select * from private.free_tables(x.id, v_period, p_party)
  loop
    begin
      insert into public.reservations
        (restaurant_id, request_id, table_id, period, party_size, guest_name, guest_phone, guest_email, comment, cancel_token_hash)
      values
        (x.id, p_request_id, t.id, v_period, p_party, p_name, p_phone, p_email, p_comment, private.token_hash(v_token))
      returning * into v_row;

      return jsonb_build_object(
        'ok', true,
        'created', true,
        'reservation', private.reservation_json(v_row),
        'restaurant', private.restaurant_json(x.id),
        'cancel_token', v_token,
        'cancel_min_before', s.guest_cancel_min_before,
        -- rezerwacja „na zaraz” może być już po terminie odwołania online
        'cancellable', (private.guest_view(v_row, now()) ->> 'cancellable')::boolean
      );
    exception
      when exclusion_violation then
        null;  -- stolik zajęty w ostatniej chwili → następny
      when unique_violation then
        -- równoległa wysyłka tego samego request_id zdążyła pierwsza
        select * into v_row from public.reservations where request_id = p_request_id and restaurant_id = x.id;
        if not found then
          raise;
        end if;
        return jsonb_build_object('ok', true, 'created', false,
          'reservation', private.reservation_json(v_row), 'restaurant', private.restaurant_json(x.id));
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;


-- ---------------------------------------------------------------------
-- public.reservation_by_token — strona /odwolaj/ pokazuje, co gość odwołuje
-- ---------------------------------------------------------------------
create or replace function public.reservation_by_token(p_token text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  r public.reservations;
begin
  select * into r from public.reservations where cancel_token_hash = private.token_hash(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'reservation', private.guest_view(r, now()));
end;
$$;


-- ---------------------------------------------------------------------
-- public.cancel_reservation_by_token — odwołanie przez gościa
-- Błędy: not_found · already_cancelled · too_late
-- ---------------------------------------------------------------------
create or replace function public.cancel_reservation_by_token(p_token text)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  r public.reservations;
begin
  select * into r from public.reservations
   where cancel_token_hash = private.token_hash(p_token)
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if r.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', 'already_cancelled');
  end if;
  if not (private.guest_view(r, now()) ->> 'cancellable')::boolean then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  update public.reservations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = null, cancelled_via = 'guest'
   where id = r.id
  returning * into r;

  return jsonb_build_object('ok', true, 'reservation', private.guest_view(r, now()));
end;
$$;


-- ---------------------------------------------------------------------
-- public.cancel_reservation — anulowanie z panelu (tylko obsługa TEJ restauracji)
-- Cudza rezerwacja wygląda tak samo jak nieistniejąca: not_found.
-- ---------------------------------------------------------------------
create or replace function public.cancel_reservation(p_id uuid)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.reservations r
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_via = 'staff'
   where r.id = p_id
     and r.status = 'confirmed'
     and exists (select 1 from public.staff st where st.user_id = auth.uid() and st.restaurant_id = r.restaurant_id)
  returning r.id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------
-- public.staff_reservations — rezerwacje jednego dnia dla panelu
-- Godziny zwracane już w czasie lokalnym, żeby panel nie liczył stref.
-- ---------------------------------------------------------------------
create or replace function public.staff_reservations(p_slug text, p_date date)
returns table (
  id            uuid,
  start_time    text,
  end_time      text,
  party_size    smallint,
  table_label   text,
  table_seats   smallint,
  guest_name    text,
  guest_phone   text,
  guest_email   text,
  comment       text,
  status        text,
  cancelled_via text,
  created_at    timestamptz
)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  x      public.restaurants;
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  x := private.restaurant_by_slug(p_slug);
  if x.id is null or not public.is_staff(x.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select s.timezone into v_tz from public.settings s where s.restaurant_id = x.id;
  v_from := p_date::timestamp at time zone v_tz;
  v_to   := (p_date + 1)::timestamp at time zone v_tz;

  return query
    select r.id,
           to_char(lower(r.period) at time zone v_tz, 'HH24:MI'),
           to_char(upper(r.period) at time zone v_tz, 'HH24:MI'),
           r.party_size,
           t.label,
           t.seats,
           r.guest_name,
           r.guest_phone,
           r.guest_email,
           r.comment,
           r.status,
           r.cancelled_via,
           r.created_at
    from public.reservations r
    join public.dining_tables t on t.id = r.table_id
    where r.restaurant_id = x.id
      and lower(r.period) >= v_from and lower(r.period) < v_to
    order by lower(r.period), t.sort, t.label;
end;
$$;


-- ---------------------------------------------------------------------
-- private.purge_old_reservations — retencja danych (RODO), wołana przez pg_cron
-- Każda restauracja ma własne settings.retention_days.
-- ---------------------------------------------------------------------
create or replace function private.purge_old_reservations()
returns int
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.reservations r
  using public.settings s
  where s.restaurant_id = r.restaurant_id
    and upper(r.period) < now() - make_interval(days => s.retention_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
