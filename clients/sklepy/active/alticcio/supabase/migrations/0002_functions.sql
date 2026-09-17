-- =====================================================================
-- 0002: logika rezerwacji
--
-- Wszystkie funkcje mają `set search_path = ''` i w pełni kwalifikowane nazwy —
-- przy `security definer` to wymóg bezpieczeństwa, nie styl.
-- =====================================================================


-- ---------------------------------------------------------------------
-- private.slot_period — przedział czasu rezerwacji
-- Data i godzina są lokalne (Warszawa); wynik to prawdziwe momenty w czasie,
-- więc zmiana czasu letni/zimowy i zamknięcie o północy liczą się poprawnie.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- private.slot_error — czy termin jest w ogóle dopuszczalny (bez patrzenia na stoliki)
-- Zwraca NULL, gdy wszystko w porządku, albo kod błędu.
-- p_now jest parametrem, żeby dało się to testować deterministycznie.
-- ---------------------------------------------------------------------
create or replace function private.slot_error(
  p_date date, p_start_min int, p_duration_min int, p_party int, p_now timestamptz
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
  select * into s from public.settings where id;
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

  select * into oh from public.opening_hours where weekday = extract(isodow from p_date);
  if not found then
    return 'closed';
  end if;

  if p_start_min < oh.opens_min
     or (p_start_min - oh.opens_min) % s.slot_interval_min <> 0 then
    return 'outside_hours';
  end if;

  v_period := private.slot_period(p_date, p_start_min, p_duration_min, s.timezone);

  -- Rezerwacja musi się skończyć najpóźniej o zamknięciu.
  if upper(v_period) > (p_date::timestamp + make_interval(mins => oh.closes_min)) at time zone s.timezone then
    return 'outside_hours';
  end if;

  v_today := (p_now at time zone s.timezone)::date;
  if p_date > v_today + s.booking_horizon_days then
    return 'beyond_horizon';
  end if;

  -- Obejmuje też terminy w przeszłości.
  if lower(v_period) < p_now + make_interval(mins => s.min_lead_min) then
    return 'too_soon';
  end if;

  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- private.free_tables — stoliki pasujące do grupy i wolne w danym przedziale,
-- od najmniejszego (żeby para nie zajmowała sześcioosobowego stołu).
-- ---------------------------------------------------------------------
create or replace function private.free_tables(p_period tstzrange, p_party int)
returns setof public.dining_tables
language sql stable
set search_path = ''
as $$
  select t.*
  from public.dining_tables t
  where t.active
    and p_party between t.min_party and t.seats
    and not exists (
      select 1 from public.reservations r
      where r.table_id = t.id
        and r.status = 'confirmed'
        and r.period && p_period
    )
  order by t.seats, t.sort, t.id;
$$;


-- ---------------------------------------------------------------------
-- private.reservation_json — to, co wraca do gościa po rezerwacji
-- (bez numeru stolika — przydział jest sprawą obsługi).
-- ---------------------------------------------------------------------
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
  from public.settings s where s.id;
$$;


-- ---------------------------------------------------------------------
-- public.is_staff — czy zalogowany użytkownik ma dostęp do panelu
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;


-- ---------------------------------------------------------------------
-- public.get_available_slots — wolne godziny startu (dla gości, klucz publiczny)
-- Zwraca wyłącznie godziny „HH:MI”. Żadnych danych o innych rezerwacjach.
-- ---------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_date date, p_party int, p_duration int
) returns table (start_time text)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  s  public.settings;
  oh public.opening_hours;
  m  int;
begin
  select * into s from public.settings where id;
  select * into oh from public.opening_hours where weekday = extract(isodow from p_date);
  if s is null or oh is null or p_party is null or p_duration is null then
    return;
  end if;

  for m in select generate_series(oh.opens_min::int, oh.closes_min::int - p_duration, s.slot_interval_min::int)
  loop
    if private.slot_error(p_date, m, p_duration, p_party, now()) is null
       and exists (select 1 from private.free_tables(private.slot_period(p_date, m, p_duration, s.timezone), p_party))
    then
      start_time := lpad((m / 60)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0');
      return next;
    end if;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- public.create_reservation — zapis rezerwacji
-- Wywoływana WYŁĄCZNIE przez funkcję Cloudflare Pages (klucz secret / service_role)
-- po weryfikacji Turnstile. Klucz publiczny nie ma do niej uprawnień (0003).
--
-- Zwraca {ok: true, reservation: {...}} albo {ok: false, error: '<kod>'}.
-- ---------------------------------------------------------------------
create or replace function public.create_reservation(
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
  s         public.settings;
  v_row     public.reservations;
  v_start   int;
  v_err     text;
  v_period  tstzrange;
  v_active  int;
  t         record;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Ta sama próba wysłana drugi raz (np. zerwane połączenie) → ta sama rezerwacja.
  select * into v_row from public.reservations where request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'reservation', private.reservation_json(v_row));
  end if;

  select * into s from public.settings where id;

  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  v_start := split_part(p_time, ':', 1)::int * 60 + split_part(p_time, ':', 2)::int;

  v_err := private.slot_error(p_date, v_start, p_duration, p_party, now());
  if v_err is not null then
    return jsonb_build_object('ok', false, 'error', v_err);
  end if;

  p_name    := nullif(btrim(p_name), '');
  p_phone   := btrim(p_phone);
  p_email   := nullif(lower(btrim(p_email)), '');
  p_comment := nullif(btrim(p_comment), '');

  if p_name is null or char_length(p_name) > 80
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or (p_email is not null and (char_length(p_email) > 254 or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     or (p_comment is not null and char_length(p_comment) > 500)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Limit aktywnych rezerwacji na numer. Blokada doradcza serializuje równoległe
  -- próby z tego samego numeru, żeby nie dało się obejść limitu wyścigiem.
  perform pg_advisory_xact_lock(hashtextextended('reservation-phone:' || p_phone, 0));
  select count(*) into v_active
  from public.reservations
  where guest_phone = p_phone and status = 'confirmed' and upper(period) > now();
  if v_active >= s.max_active_per_phone then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;

  v_period := private.slot_period(p_date, v_start, p_duration, s.timezone);

  -- Próbujemy kolejne pasujące stoliki. Jeśli w międzyczasie ktoś zajął stolik,
  -- constraint wykluczający rzuci exclusion_violation i przechodzimy do następnego.
  for t in select * from private.free_tables(v_period, p_party)
  loop
    begin
      insert into public.reservations
        (request_id, table_id, period, party_size, guest_name, guest_phone, guest_email, comment)
      values
        (p_request_id, t.id, v_period, p_party, p_name, p_phone, p_email, p_comment)
      returning * into v_row;

      return jsonb_build_object('ok', true, 'reservation', private.reservation_json(v_row));
    exception
      when exclusion_violation then
        null;  -- stolik zajęty w ostatniej chwili → następny
      when unique_violation then
        -- równoległa wysyłka tego samego request_id zdążyła pierwsza
        select * into v_row from public.reservations where request_id = p_request_id;
        return jsonb_build_object('ok', true, 'reservation', private.reservation_json(v_row));
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;


-- ---------------------------------------------------------------------
-- public.cancel_reservation — anulowanie z panelu (tylko obsługa)
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
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.reservations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_id and status = 'confirmed'
  returning id into v_id;

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
create or replace function public.staff_reservations(p_date date)
returns table (
  id           uuid,
  start_time   text,
  end_time     text,
  party_size   smallint,
  table_label  text,
  table_seats  smallint,
  guest_name   text,
  guest_phone  text,
  guest_email  text,
  comment      text,
  status       text,
  created_at   timestamptz
)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select s.timezone into v_tz from public.settings s where s.id;
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
           r.created_at
    from public.reservations r
    join public.dining_tables t on t.id = r.table_id
    where lower(r.period) >= v_from and lower(r.period) < v_to
    order by lower(r.period), t.sort, t.label;
end;
$$;


-- ---------------------------------------------------------------------
-- private.purge_old_reservations — retencja danych (RODO), wołana przez pg_cron
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
  where s.id
    and upper(r.period) < now() - make_interval(days => s.retention_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
