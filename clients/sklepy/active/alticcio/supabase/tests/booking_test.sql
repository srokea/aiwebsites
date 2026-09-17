-- =====================================================================
-- Testy logiki rezerwacji.
--
-- Całość w transakcji zakończonej ROLLBACK — niczego nie zostawia w bazie,
-- więc można to uruchomić w SQL Editorze Supabase także na produkcji.
-- Wynik: komunikat „WSZYSTKIE TESTY OK” albo błąd „FAIL: …” wskazujący przypadek.
--
-- Wyścig wielu równoczesnych rezerwacji nie da się sprawdzić w jednej sesji SQL —
-- do tego służy tests/race.mjs (przez funkcję /api/reserve).
-- =====================================================================

begin;

create function pg_temp.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_msg;
  end if;
end;
$$;

-- Znane, stałe reguły na czas testów (niezależnie od tego, co ustawił klient).
update public.settings set
  timezone = 'Europe/Warsaw', slot_interval_min = 30, durations_min = '{90,120,150,180}',
  default_duration_min = 120, max_party = 8, booking_horizon_days = 60, min_lead_min = 60,
  max_active_per_phone = 2, retention_days = 30
where id;

insert into public.opening_hours (weekday, opens_min, closes_min) values
  (1, 720, 1380), (2, 720, 1380), (3, 720, 1380), (4, 720, 1380),
  (5, 720, 1440), (6, 720, 1440), (7, 720, 1320)
on conflict (weekday) do update set opens_min = excluded.opens_min, closes_min = excluded.closes_min;

-- Sala testowa: tylko dwa stoliki, prawdziwe wyłączone.
update public.dining_tables set active = false;
insert into public.dining_tables (label, seats, min_party, sort) values
  ('test-2', 2, 1, 900),
  ('test-4', 4, 2, 901);


do $$
declare
  tz        constant text := 'Europe/Warsaw';
  v_today   date := (now() at time zone tz)::date;
  -- piątek w przyszłym tygodniu: zawsze 5–11 dni naprzód, czyli w horyzoncie i poza min. wyprzedzeniem
  v_fri     date := v_today + (12 - extract(isodow from v_today)::int);
  v_sun     date := v_fri + 2;
  v_mon     date := v_fri + 3;
  v_now     timestamptz;
  v_res     jsonb;
  v_res2    jsonb;
  v_slots   text[];
  v_id      uuid;
  v_req     uuid := gen_random_uuid();
  v_staff   uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_count   int;
  v_anon_read_res boolean;
  v_anon_create   boolean;
  v_anon_tables   boolean;
  v_anon_day      boolean;
  v_anon_slots    int;
  v_anon_party    int;
begin
  perform pg_temp.ok(extract(isodow from v_fri) = 5, 'v_fri to piątek');

  -- ------------------------------------------------------------------
  -- 1. Przedziały czasu i zmiana czasu (DST)
  -- ------------------------------------------------------------------
  perform pg_temp.ok(
    upper(private.slot_period('2026-10-25', 20*60, 120, tz)) - lower(private.slot_period('2026-10-25', 20*60, 120, tz)) = interval '2 hours',
    'DST jesień: 2 godz. to 2 godz.');
  perform pg_temp.ok(
    to_char(upper(private.slot_period('2026-10-25', 60, 180, tz)) at time zone tz, 'HH24:MI') = '03:00',
    'DST jesień: 01:00 + 3 h zegar cofnięty → 03:00');
  perform pg_temp.ok(
    to_char(upper(private.slot_period('2027-03-28', 60, 180, tz)) at time zone tz, 'HH24:MI') = '05:00',
    'DST wiosna: 01:00 + 3 h zegar przestawiony → 05:00');
  perform pg_temp.ok(
    to_char(upper(private.slot_period(v_fri, 21*60, 180, tz)) at time zone tz, 'YYYY-MM-DD HH24:MI')
      = to_char(v_fri + 1, 'YYYY-MM-DD') || ' 00:00',
    'piątek 21:00 + 3 h kończy się o północy następnego dnia');

  -- ------------------------------------------------------------------
  -- 2. Reguły terminu (slot_error) przy ustalonym „teraz”
  -- ------------------------------------------------------------------
  v_now := (v_fri - 3)::timestamp at time zone tz + interval '10 hours';

  perform pg_temp.ok(private.slot_error(v_fri, 21*60,     180, 2, v_now) is null,           'pt 21:00/3h → OK (koniec o 00:00)');
  perform pg_temp.ok(private.slot_error(v_fri, 21*60+30,  180, 2, v_now) = 'outside_hours', 'pt 21:30/3h → po zamknięciu');
  perform pg_temp.ok(private.slot_error(v_sun, 20*60,     120, 2, v_now) is null,           'nd 20:00/2h → OK (koniec o 22:00)');
  perform pg_temp.ok(private.slot_error(v_sun, 20*60+30,  120, 2, v_now) = 'outside_hours', 'nd 20:30/2h → po zamknięciu');
  perform pg_temp.ok(private.slot_error(v_fri, 11*60+30,  120, 2, v_now) = 'outside_hours', 'przed otwarciem');
  perform pg_temp.ok(private.slot_error(v_fri, 12*60+15,  120, 2, v_now) = 'outside_hours', 'godzina spoza siatki 30 min');
  perform pg_temp.ok(private.slot_error(v_fri, 19*60,     100, 2, v_now) = 'invalid_duration', 'nieznany czas przy stoliku');
  perform pg_temp.ok(private.slot_error(v_fri, 19*60,     120, 9, v_now) = 'invalid_party',    'grupa ponad max_party');
  perform pg_temp.ok(private.slot_error(v_fri, 19*60,     120, 0, v_now) = 'invalid_party',    'grupa 0 osób');

  perform pg_temp.ok(private.slot_error(v_fri, 19*60, 120, 2, (v_fri - 61)::timestamp at time zone tz) = 'beyond_horizon',
    'termin dalej niż horyzont');
  perform pg_temp.ok(private.slot_error(v_fri, 12*60, 120, 2, v_fri::timestamp at time zone tz + interval '11 hours 30 minutes') = 'too_soon',
    '30 min przed startem → za późno (min. 60)');
  perform pg_temp.ok(private.slot_error(v_fri, 12*60, 120, 2, v_fri::timestamp at time zone tz + interval '11 hours') is null,
    'dokładnie 60 min przed startem → OK');
  perform pg_temp.ok(private.slot_error(v_fri, 12*60, 120, 2, (v_fri + 1)::timestamp at time zone tz) = 'too_soon',
    'termin w przeszłości');

  delete from public.opening_hours where weekday = 1;
  perform pg_temp.ok(private.slot_error(v_mon, 19*60, 120, 2, v_now) = 'closed', 'dzień bez godzin otwarcia → zamknięte');
  insert into public.opening_hours values (1, 720, 1380);

  -- ------------------------------------------------------------------
  -- 3. Wolne godziny na pustej sali
  -- ------------------------------------------------------------------
  select array_agg(start_time) into v_slots from public.get_available_slots(v_fri, 2, 120);
  perform pg_temp.ok(cardinality(v_slots) = 21,     'pt, 2 os., 2 h: 21 startów 12:00–22:00, jest ' || coalesce(cardinality(v_slots), 0));
  perform pg_temp.ok(v_slots[1] = '12:00',          'pierwszy start 12:00');
  perform pg_temp.ok(v_slots[21] = '22:00',         'ostatni start 22:00 (koniec o północy)');

  perform pg_temp.ok(not exists (select 1 from public.get_available_slots(v_fri, 5, 120)), 'grupa 5 os. bez pasującego stolika → brak godzin');
  perform pg_temp.ok(not exists (select 1 from public.get_available_slots(v_fri, 9, 120)), 'grupa ponad max_party → brak godzin');

  -- ------------------------------------------------------------------
  -- 4. Rezerwacje, przydział stolika, znikanie godzin
  -- ------------------------------------------------------------------
  v_res := public.create_reservation(v_req, v_fri, '19:00', 2, 120, '  Anna ', '+48600100200', ' Anna@Example.com ', null);
  perform pg_temp.ok((v_res->>'ok')::boolean, 'rezerwacja 1: ' || v_res::text);
  v_id := (v_res->'reservation'->>'id')::uuid;

  perform pg_temp.ok(
    (select t.label from public.reservations r join public.dining_tables t on t.id = r.table_id where r.id = v_id) = 'test-2',
    'para dostaje najmniejszy stolik');
  perform pg_temp.ok(
    (select guest_name = 'Anna' and guest_email = 'anna@example.com' from public.reservations where id = v_id),
    'imię przycięte, e-mail znormalizowany');
  perform pg_temp.ok(v_res->'reservation'->>'time' = '19:00' and v_res->'reservation'->>'end_time' = '21:00',
    'odpowiedź zawiera godziny lokalne');

  -- ta sama próba jeszcze raz → ta sama rezerwacja, bez duplikatu
  v_res2 := public.create_reservation(v_req, v_fri, '19:00', 2, 120, 'Anna', '+48600100200', null, null);
  perform pg_temp.ok((v_res2->'reservation'->>'id')::uuid = v_id, 'ponowiony request_id zwraca tę samą rezerwację');
  perform pg_temp.ok((select count(*) from public.reservations where request_id = v_req) = 1, 'brak duplikatu po ponowieniu');

  v_res := public.create_reservation(gen_random_uuid(), v_fri, '19:00', 2, 120, 'Bartek', '+48600100201', null, 'przy oknie');
  perform pg_temp.ok((v_res->>'ok')::boolean, 'rezerwacja 2 (drugi stolik): ' || v_res::text);

  v_res := public.create_reservation(gen_random_uuid(), v_fri, '19:00', 2, 120, 'Celina', '+48600100202', null, null);
  perform pg_temp.ok(v_res->>'error' = 'slot_taken', 'trzecia para o 19:00 → slot_taken, jest ' || v_res::text);

  select array_agg(start_time) into v_slots from public.get_available_slots(v_fri, 2, 120);
  perform pg_temp.ok('17:00' = any (v_slots),     '17:00–19:00 styka się z 19:00 → dostępne');
  perform pg_temp.ok(not ('17:30' = any (v_slots)), '17:30 nachodzi na 19:00 → zniknęło');
  perform pg_temp.ok(not ('19:00' = any (v_slots)), '19:00 zniknęło');
  perform pg_temp.ok(not ('20:30' = any (v_slots)), '20:30 nachodzi na 19–21 → zniknęło');
  perform pg_temp.ok('21:00' = any (v_slots),     '21:00 zaczyna się, gdy tamte kończą → dostępne');

  -- constraint działa też z pominięciem funkcji
  begin
    insert into public.reservations (request_id, table_id, period, party_size, guest_name, guest_phone)
    select gen_random_uuid(), table_id, private.slot_period(v_fri, 20*60, 90, tz), 2, 'X', '+48600100299'
    from public.reservations where id = v_id;
    raise exception 'FAIL: bezpośredni INSERT nachodzącej rezerwacji przeszedł';
  exception when exclusion_violation then
    null;
  end;

  -- walidacja danych gościa
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '13:00', 2, 120, '   ', '+48600100203', null, null)->>'error' = 'invalid', 'puste imię');
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '600100203', null, null)->>'error' = 'invalid', 'telefon bez +48 (normalizuje funkcja Pages)');
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', 'nie-mail', null)->>'error' = 'invalid', 'zły e-mail');
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '25:00', 2, 120, 'Ola', '+48600100203', null, null)->>'error' = 'invalid', 'zła godzina');
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', null, repeat('x', 501))->>'error' = 'invalid', 'za długi komentarz');

  -- ------------------------------------------------------------------
  -- 5. Limit aktywnych rezerwacji na numer
  -- ------------------------------------------------------------------
  perform pg_temp.ok((public.create_reservation(gen_random_uuid(), v_fri, '12:00', 1, 90, 'Darek', '+48600100204', null, null)->>'ok')::boolean, 'limit: 1. rezerwacja');
  perform pg_temp.ok((public.create_reservation(gen_random_uuid(), v_fri, '14:00', 1, 90, 'Darek', '+48600100204', null, null)->>'ok')::boolean, 'limit: 2. rezerwacja');
  perform pg_temp.ok(public.create_reservation(gen_random_uuid(), v_fri, '16:00', 1, 90, 'Darek', '+48600100204', null, null)->>'error' = 'limit', 'limit: 3. rezerwacja odrzucona');

  -- ------------------------------------------------------------------
  -- 6. Panel: anulowanie i lista dnia
  -- ------------------------------------------------------------------
  insert into auth.users (id) values (v_staff), (v_other);
  insert into public.staff (user_id) values (v_staff);

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  begin
    perform public.cancel_reservation(v_id);
    raise exception 'FAIL: anulowanie przez osobę spoza obsługi przeszło';
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform pg_temp.ok((public.cancel_reservation(v_id)->>'ok')::boolean, 'anulowanie przez obsługę');
  perform pg_temp.ok(public.cancel_reservation(v_id)->>'error' = 'not_found', 'drugie anulowanie → not_found');
  perform pg_temp.ok((select cancelled_by = v_staff and cancelled_at is not null from public.reservations where id = v_id), 'zapisano kto i kiedy anulował');
  perform pg_temp.ok(exists (select 1 from public.get_available_slots(v_fri, 2, 120) where start_time = '19:00'), 'po anulowaniu 19:00 wraca');

  select count(*) into v_count from public.staff_reservations(v_fri);
  perform pg_temp.ok(v_count = 4, 'lista dnia: 4 rezerwacje (w tym anulowana), jest ' || v_count);
  perform pg_temp.ok(exists (select 1 from public.staff_reservations(v_fri) where start_time = '19:00' and end_time = '21:00' and table_label = 'test-4' and comment = 'przy oknie'),
    'lista dnia: godziny lokalne, stolik, komentarz');

  -- ------------------------------------------------------------------
  -- 7. Uprawnienia ról API
  -- ------------------------------------------------------------------
  -- Jako anon tylko zbieramy wyniki; asercje dopiero po powrocie do roli właściciela.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';

  begin
    perform count(*) from public.reservations;
    v_anon_read_res := true;
  exception when insufficient_privilege then v_anon_read_res := false;
  end;

  begin
    perform public.create_reservation(gen_random_uuid(), v_fri, '13:00', 2, 120, 'Hacker', '+48600100299', null, null);
    v_anon_create := true;
  exception when insufficient_privilege then v_anon_create := false;
  end;

  begin
    perform count(*) from public.dining_tables;
    v_anon_tables := true;
  exception when insufficient_privilege then v_anon_tables := false;
  end;

  begin
    perform public.staff_reservations(v_fri);
    v_anon_day := true;
  exception when insufficient_privilege then v_anon_day := false;
  end;

  select count(*) into v_anon_slots from public.get_available_slots(v_fri, 2, 120);
  select max_party into v_anon_party from public.settings;
  execute 'reset role';

  perform pg_temp.ok(not v_anon_read_res, 'anon: brak odczytu reservations');
  perform pg_temp.ok(not v_anon_create,   'anon: brak wywołania create_reservation');
  perform pg_temp.ok(not v_anon_tables,   'anon: brak odczytu dining_tables');
  perform pg_temp.ok(not v_anon_day,      'anon: brak listy dnia');
  perform pg_temp.ok(v_anon_slots > 0,    'anon: wolne godziny dostępne');
  perform pg_temp.ok(v_anon_party = 8,    'anon: odczyt ustawień');

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.reservations;
  execute 'reset role';
  perform pg_temp.ok(v_count = 0, 'zalogowany spoza obsługi: RLS ukrywa rezerwacje');

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.reservations;
  execute 'reset role';
  perform pg_temp.ok(v_count >= 4, 'obsługa: RLS pokazuje rezerwacje');

  -- ------------------------------------------------------------------
  -- 8. Retencja
  -- ------------------------------------------------------------------
  insert into public.reservations (request_id, table_id, period, party_size, guest_name, guest_phone)
  select gen_random_uuid(), id, private.slot_period(v_today - 40, 12*60, 120, tz), 2, 'Stary', '+48600100205'
  from public.dining_tables where label = 'test-2';

  perform private.purge_old_reservations();
  perform pg_temp.ok(not exists (select 1 from public.reservations where guest_name = 'Stary'), 'retencja usuwa rezerwacje sprzed 30+ dni');
  perform pg_temp.ok((select count(*) from public.reservations r join public.dining_tables t on t.id = r.table_id where t.label like 'test-%') = 4,
    'retencja nie rusza przyszłych rezerwacji');

  raise notice 'WSZYSTKIE TESTY OK';
end;
$$;

rollback;
