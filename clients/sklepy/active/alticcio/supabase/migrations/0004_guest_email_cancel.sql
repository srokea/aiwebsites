-- =====================================================================
-- Alticcio — system rezerwacji stolików
-- 0004: e-mail z potwierdzeniem i odwołanie rezerwacji przez gościa
--
-- Po utworzeniu rezerwacji baza generuje losowy token odwołania. W bazie
-- zostaje tylko jego skrót SHA-256; sam token idzie raz do funkcji Pages,
-- która wkleja go w link w mailu. Kto ma link, może podejrzeć i odwołać
-- tę jedną rezerwację — do settings.guest_cancel_min_before przed wizytą.
-- =====================================================================

alter table public.settings
  add column guest_cancel_min_before smallint not null default 120
    check (guest_cancel_min_before between 0 and 2880);

alter table public.reservations
  add column cancel_token_hash bytea unique,
  add column cancelled_via text check (cancelled_via in ('staff', 'guest'));

comment on column public.reservations.cancel_token_hash is
  'sha256(token) z linku „Odwołaj” w mailu. Samego tokenu baza nie przechowuje.';


-- ---------------------------------------------------------------------
-- private.token_hash / private.guest_view
-- ---------------------------------------------------------------------
create or replace function private.token_hash(p_token text)
returns bytea
language sql immutable
set search_path = ''
as $$
  select case when p_token ~ '^[0-9a-f]{64}$' then sha256(convert_to(p_token, 'UTF8')) end;
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
  from public.settings s where s.id;
$$;


-- ---------------------------------------------------------------------
-- public.create_reservation — jak w 0002, plus:
--   · e-mail jest obowiązkowy,
--   · nowa rezerwacja dostaje token odwołania,
--   · odpowiedź mówi, czy rezerwacja powstała teraz (created) — tylko wtedy
--     zawiera cancel_token, żeby ponowiona wysyłka nie wysłała drugiego maila,
--   · cancellable: czy odwołanie z maila jest jeszcze możliwe.
-- Sygnatura bez zmian, więc granty z 0003 zostają.
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
  v_token   text;
  t         record;
begin
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Ta sama próba wysłana drugi raz (np. zerwane połączenie) → ta sama rezerwacja, bez tokenu.
  select * into v_row from public.reservations where request_id = p_request_id;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'reservation', private.reservation_json(v_row));
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
     or p_email is null or char_length(p_email) > 254
     or p_email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
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

  -- 64 znaki hex z dwóch losowych UUID (244 bity losowości).
  v_token := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');

  -- Próbujemy kolejne pasujące stoliki. Jeśli w międzyczasie ktoś zajął stolik,
  -- constraint wykluczający rzuci exclusion_violation i przechodzimy do następnego.
  for t in select * from private.free_tables(v_period, p_party)
  loop
    begin
      insert into public.reservations
        (request_id, table_id, period, party_size, guest_name, guest_phone, guest_email, comment, cancel_token_hash)
      values
        (p_request_id, t.id, v_period, p_party, p_name, p_phone, p_email, p_comment, private.token_hash(v_token))
      returning * into v_row;

      return jsonb_build_object(
        'ok', true,
        'created', true,
        'reservation', private.reservation_json(v_row),
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
        select * into v_row from public.reservations where request_id = p_request_id;
        if not found then
          raise;
        end if;
        return jsonb_build_object('ok', true, 'created', false, 'reservation', private.reservation_json(v_row));
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
-- public.cancel_reservation — obsługa; teraz zapisuje też, kto odwołał
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
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_via = 'staff'
   where id = p_id and status = 'confirmed'
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------
-- public.staff_reservations — nowa kolumna cancelled_via (zmiana typu wyniku
-- wymaga drop + create, więc granty trzeba nadać od nowa)
-- ---------------------------------------------------------------------
drop function public.staff_reservations(date);

create function public.staff_reservations(p_date date)
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
           r.cancelled_via,
           r.created_at
    from public.reservations r
    join public.dining_tables t on t.id = r.table_id
    where lower(r.period) >= v_from and lower(r.period) < v_to
    order by lower(r.period), t.sort, t.label;
end;
$$;


-- ---------------------------------------------------------------------
-- Uprawnienia. Supabase domyślnie daje execute na nowych funkcjach
-- rolom anon i authenticated — zabieramy i nadajemy tylko to, co trzeba.
-- ---------------------------------------------------------------------
revoke all on function private.token_hash(text)                                  from public, anon, authenticated;
revoke all on function private.guest_view(public.reservations, timestamptz)      from public, anon, authenticated;
revoke all on function public.reservation_by_token(text)                         from public, anon, authenticated;
revoke all on function public.cancel_reservation_by_token(text)                  from public, anon, authenticated;
revoke all on function public.staff_reservations(date)                           from public, anon, authenticated;

-- Token (64 znaki hex) jest jedynym „hasłem” — odgadnąć go się nie da, więc klucz publiczny wystarczy.
grant execute on function public.reservation_by_token(text)        to anon, authenticated;
grant execute on function public.cancel_reservation_by_token(text) to anon, authenticated;
grant execute on function public.staff_reservations(date)          to authenticated;
