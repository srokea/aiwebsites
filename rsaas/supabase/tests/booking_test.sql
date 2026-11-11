-- =====================================================================
-- RSaaS — testy logiki rezerwacji i izolacji restauracji.
--
-- Całość w transakcji zakończonej ROLLBACK — niczego nie zostawia w bazie,
-- więc można to uruchomić także na produkcji:
--   psql "$RSAAS_DB_URL" -v ON_ERROR_STOP=1 -f rsaas/supabase/tests/booking_test.sql
-- (albo wkleić w SQL Editor Supabase).
-- Wynik: komunikat „WSZYSTKIE TESTY OK” albo błąd „FAIL: …” wskazujący przypadek.
--
-- Dwie restauracje testowe: A (rsaas-test-a) i B (rsaas-test-b), każda z własną salą.
-- Wyścig wielu równoczesnych rezerwacji nie da się sprawdzić w jednej sesji SQL —
-- do tego służy rsaas/tests/race.mjs (przez funkcję /api/reserve).
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

-- Restauracje testowe ze znanymi, stałymi regułami.
insert into public.restaurants (slug, name, address, phone) values
  ('rsaas-test-a', 'Test A', 'ul. Testowa 1, Gdańsk', '500 000 001'),
  ('rsaas-test-b', 'Test B', 'ul. Testowa 2, Gdańsk', '500 000 002');

insert into public.settings (
  restaurant_id, timezone, slot_interval_min, durations_min, default_duration_min, max_party,
  booking_horizon_days, min_lead_min, max_active_per_phone, retention_days, guest_cancel_min_before, rules_text
)
select id, 'Europe/Warsaw', 30, '{90,120,150,180}', 120, 8, 60, 60, 2, 30, 120, 'Zasady ' || slug
from public.restaurants where slug in ('rsaas-test-a', 'rsaas-test-b');

insert into public.opening_hours (restaurant_id, weekday, opens_min, closes_min)
select x.id, d.weekday, d.opens_min, d.closes_min
from public.restaurants x
cross join (values (1, 720, 1380), (2, 720, 1380), (3, 720, 1380), (4, 720, 1380),
                   (5, 720, 1440), (6, 720, 1440), (7, 720, 1320)) as d (weekday, opens_min, closes_min)
where x.slug in ('rsaas-test-a', 'rsaas-test-b');

-- Sala A: dwa stoliki (2- i 4-osobowy). Sala B: jeden 2-osobowy.
insert into public.dining_tables (restaurant_id, label, seats, min_party, sort)
select id, 'test-2', 2, 1, 1 from public.restaurants where slug = 'rsaas-test-a'
union all
select id, 'test-4', 4, 2, 2 from public.restaurants where slug = 'rsaas-test-a'
union all
select id, 'b-2', 2, 1, 1 from public.restaurants where slug = 'rsaas-test-b';


do $$
declare
  tz        constant text := 'Europe/Warsaw';
  A         constant text := 'rsaas-test-a';
  B         constant text := 'rsaas-test-b';
  v_a       uuid := (select id from public.restaurants where slug = 'rsaas-test-a');
  v_b       uuid := (select id from public.restaurants where slug = 'rsaas-test-b');
  v_today   date := (now() at time zone tz)::date;
  -- piątek w przyszłym tygodniu: zawsze 5–11 dni naprzód, czyli w horyzoncie i poza min. wyprzedzeniem
  v_fri     date := v_today + (12 - extract(isodow from v_today)::int);
  v_sun     date := v_fri + 2;
  v_mon     date := v_fri + 3;
  v_now     timestamptz;
  v_res     jsonb;
  v_res2    jsonb;
  v_cfg     jsonb;
  v_slots   text[];
  v_id      uuid;
  v_b_id    uuid;
  v_req     uuid := gen_random_uuid();
  v_staff   uuid := gen_random_uuid();
  v_staff_b uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_count   int;
  v_anon_read_res boolean;
  v_anon_create   boolean;
  v_anon_tables   boolean;
  v_anon_rest     boolean;
  v_anon_day      boolean;
  v_anon_slots    int;
  v_anon_cfg      jsonb;
  v_token         text;
  v_anon_view     jsonb;
  v_anon_cancel   jsonb;
  v_now_id        uuid;
  v_topic         text;
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

  perform pg_temp.ok(private.slot_error(v_a, v_fri, 21*60,     180, 2, v_now) is null,           'pt 21:00/3h → OK (koniec o 00:00)');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 21*60+30,  180, 2, v_now) = 'outside_hours', 'pt 21:30/3h → po zamknięciu');
  perform pg_temp.ok(private.slot_error(v_a, v_sun, 20*60,     120, 2, v_now) is null,           'nd 20:00/2h → OK (koniec o 22:00)');
  perform pg_temp.ok(private.slot_error(v_a, v_sun, 20*60+30,  120, 2, v_now) = 'outside_hours', 'nd 20:30/2h → po zamknięciu');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 11*60+30,  120, 2, v_now) = 'outside_hours', 'przed otwarciem');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 12*60+15,  120, 2, v_now) = 'outside_hours', 'godzina spoza siatki 30 min');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 19*60,     100, 2, v_now) = 'invalid_duration', 'nieznany czas przy stoliku');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 19*60,     120, 9, v_now) = 'invalid_party',    'grupa ponad max_party');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 19*60,     120, 0, v_now) = 'invalid_party',    'grupa 0 osób');

  perform pg_temp.ok(private.slot_error(v_a, v_fri, 19*60, 120, 2, (v_fri - 61)::timestamp at time zone tz) = 'beyond_horizon',
    'termin dalej niż horyzont');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 12*60, 120, 2, v_fri::timestamp at time zone tz + interval '11 hours 30 minutes') = 'too_soon',
    '30 min przed startem → za późno (min. 60)');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 12*60, 120, 2, v_fri::timestamp at time zone tz + interval '11 hours') is null,
    'dokładnie 60 min przed startem → OK');
  perform pg_temp.ok(private.slot_error(v_a, v_fri, 12*60, 120, 2, (v_fri + 1)::timestamp at time zone tz) = 'too_soon',
    'termin w przeszłości');

  delete from public.opening_hours where restaurant_id = v_a and weekday = 1;
  perform pg_temp.ok(private.slot_error(v_a, v_mon, 19*60, 120, 2, v_now) = 'closed', 'dzień bez godzin otwarcia → zamknięte');
  perform pg_temp.ok(private.slot_error(v_b, v_mon, 19*60, 120, 2, v_now) is null,     'izolacja: godziny A nie zamykają B');
  insert into public.opening_hours values (v_a, 1, 720, 1380);

  -- ------------------------------------------------------------------
  -- 3. Konfiguracja i wolne godziny na pustej sali
  -- ------------------------------------------------------------------
  v_cfg := public.get_public_config(A);
  perform pg_temp.ok((v_cfg->>'ok')::boolean and v_cfg->'restaurant'->>'name' = 'Test A'
    and (v_cfg->'settings'->>'max_party')::int = 8 and jsonb_array_length(v_cfg->'hours') = 7
    and v_cfg->'settings'->>'rules_text' = 'Zasady rsaas-test-a',
    'get_public_config(A): nazwa, ustawienia, 7 dni ' || v_cfg::text);
  perform pg_temp.ok(public.get_public_config('nie-ma-takiej')->>'error' = 'not_found', 'get_public_config: zły slug → not_found');

  select array_agg(start_time) into v_slots from public.get_available_slots(A, v_fri, 2, 120);
  perform pg_temp.ok(cardinality(v_slots) = 21,     'pt, 2 os., 2 h: 21 startów 12:00–22:00, jest ' || coalesce(cardinality(v_slots), 0));
  perform pg_temp.ok(v_slots[1] = '12:00',          'pierwszy start 12:00');
  perform pg_temp.ok(v_slots[21] = '22:00',         'ostatni start 22:00 (koniec o północy)');

  perform pg_temp.ok(not exists (select 1 from public.get_available_slots(A, v_fri, 5, 120)), 'grupa 5 os. bez pasującego stolika → brak godzin');
  perform pg_temp.ok(not exists (select 1 from public.get_available_slots(A, v_fri, 9, 120)), 'grupa ponad max_party → brak godzin');
  perform pg_temp.ok(not exists (select 1 from public.get_available_slots('nie-ma-takiej', v_fri, 2, 120)), 'zły slug → brak godzin');

  -- ------------------------------------------------------------------
  -- 4. Rezerwacje, przydział stolika, znikanie godzin
  -- ------------------------------------------------------------------
  v_res := public.create_reservation(A, v_req, v_fri, '19:00', 2, 120, '  Anna ', '+48600100200', ' Anna@Example.com ', null);
  perform pg_temp.ok((v_res->>'ok')::boolean, 'rezerwacja 1: ' || v_res::text);
  perform pg_temp.ok((v_res->>'created')::boolean and v_res->>'cancel_token' ~ '^[0-9a-f]{64}$', 'nowa rezerwacja: created + token');
  perform pg_temp.ok(v_res->'restaurant'->>'name' = 'Test A' and v_res->'restaurant'->>'address' = 'ul. Testowa 1, Gdańsk',
    'odpowiedź zawiera dane restauracji do maila');
  v_id := (v_res->'reservation'->>'id')::uuid;

  perform pg_temp.ok(
    (select t.label from public.reservations r join public.dining_tables t on t.id = r.table_id where r.id = v_id) = 'test-2',
    'para dostaje najmniejszy stolik');
  perform pg_temp.ok(
    (select guest_name = 'Anna' and guest_email = 'anna@example.com' and restaurant_id = v_a from public.reservations where id = v_id),
    'imię przycięte, e-mail znormalizowany, właściwa restauracja');
  perform pg_temp.ok(v_res->'reservation'->>'time' = '19:00' and v_res->'reservation'->>'end_time' = '21:00',
    'odpowiedź zawiera godziny lokalne');

  -- ta sama próba jeszcze raz → ta sama rezerwacja, bez duplikatu
  v_res2 := public.create_reservation(A, v_req, v_fri, '19:00', 2, 120, 'Anna', '+48600100200', 'anna@example.com', null);
  perform pg_temp.ok((v_res2->'reservation'->>'id')::uuid = v_id, 'ponowiony request_id zwraca tę samą rezerwację');
  perform pg_temp.ok(not (v_res2->>'created')::boolean and not (v_res2 ? 'cancel_token'), 'ponowienie: created=false, bez tokenu (drugi mail nie wyjdzie)');
  perform pg_temp.ok((select count(*) from public.reservations where request_id = v_req) = 1, 'brak duplikatu po ponowieniu');

  v_res := public.create_reservation(A, gen_random_uuid(), v_fri, '19:00', 2, 120, 'Bartek', '+48600100201', 'bartek@example.com', 'przy oknie');
  perform pg_temp.ok((v_res->>'ok')::boolean, 'rezerwacja 2 (drugi stolik): ' || v_res::text);

  v_res := public.create_reservation(A, gen_random_uuid(), v_fri, '19:00', 2, 120, 'Celina', '+48600100202', 'celina@example.com', null);
  perform pg_temp.ok(v_res->>'error' = 'slot_taken', 'trzecia para o 19:00 → slot_taken, jest ' || v_res::text);

  select array_agg(start_time) into v_slots from public.get_available_slots(A, v_fri, 2, 120);
  perform pg_temp.ok('17:00' = any (v_slots),     '17:00–19:00 styka się z 19:00 → dostępne');
  perform pg_temp.ok(not ('17:30' = any (v_slots)), '17:30 nachodzi na 19:00 → zniknęło');
  perform pg_temp.ok(not ('19:00' = any (v_slots)), '19:00 zniknęło');
  perform pg_temp.ok(not ('20:30' = any (v_slots)), '20:30 nachodzi na 19–21 → zniknęło');
  perform pg_temp.ok('21:00' = any (v_slots),     '21:00 zaczyna się, gdy tamte kończą → dostępne');

  -- constraint działa też z pominięciem funkcji
  begin
    insert into public.reservations (restaurant_id, request_id, table_id, period, party_size, guest_name, guest_phone)
    select restaurant_id, gen_random_uuid(), table_id, private.slot_period(v_fri, 20*60, 90, tz), 2, 'X', '+48600100299'
    from public.reservations where id = v_id;
    raise exception 'FAIL: bezpośredni INSERT nachodzącej rezerwacji przeszedł';
  exception when exclusion_violation then
    null;
  end;

  -- walidacja danych gościa
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, '   ', '+48600100203', 'ola@example.com', null)->>'error' = 'invalid', 'puste imię');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '600100203', 'ola@example.com', null)->>'error' = 'invalid', 'telefon bez +48 (normalizuje funkcja Pages)');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', 'nie-mail', null)->>'error' = 'invalid', 'zły e-mail');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', null, null)->>'error' = 'invalid', 'brak e-maila');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', '  ', null)->>'error' = 'invalid', 'pusty e-mail');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', 'a<b>@example.com', null)->>'error' = 'invalid', 'e-mail ze znakami spoza adresu');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '25:00', 2, 120, 'Ola', '+48600100203', 'ola@example.com', null)->>'error' = 'invalid', 'zła godzina');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', 'ola@example.com', repeat('x', 501))->>'error' = 'invalid', 'za długi komentarz');
  perform pg_temp.ok(public.create_reservation('nie-ma-takiej', gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ola', '+48600100203', 'ola@example.com', null)->>'error' = 'not_found', 'zły slug → not_found');

  -- ------------------------------------------------------------------
  -- 5. Limit aktywnych rezerwacji na numer
  -- ------------------------------------------------------------------
  perform pg_temp.ok((public.create_reservation(A, gen_random_uuid(), v_fri, '12:00', 1, 90, 'Darek', '+48600100204', 'darek@example.com', null)->>'ok')::boolean, 'limit: 1. rezerwacja');
  perform pg_temp.ok((public.create_reservation(A, gen_random_uuid(), v_fri, '14:00', 1, 90, 'Darek', '+48600100204', 'darek@example.com', null)->>'ok')::boolean, 'limit: 2. rezerwacja');
  perform pg_temp.ok(public.create_reservation(A, gen_random_uuid(), v_fri, '16:00', 1, 90, 'Darek', '+48600100204', 'darek@example.com', null)->>'error' = 'limit', 'limit: 3. rezerwacja odrzucona');

  -- ------------------------------------------------------------------
  -- 6. Panel: anulowanie i lista dnia
  -- ------------------------------------------------------------------
  insert into auth.users (id) values (v_staff), (v_staff_b), (v_other);
  insert into public.staff (user_id, restaurant_id) values (v_staff, v_a), (v_staff_b, v_b);

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform pg_temp.ok(public.cancel_reservation(v_id)->>'error' = 'not_found', 'anulowanie przez osobę spoza obsługi → not_found');
  perform pg_temp.ok((select status = 'confirmed' from public.reservations where id = v_id), 'rezerwacja po próbie obcego dalej aktywna');
  perform pg_temp.ok(not exists (select 1 from public.my_restaurants()), 'spoza obsługi: my_restaurants pusta');

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform pg_temp.ok((select array_agg(slug) from public.my_restaurants()) = array[A], 'obsługa A: my_restaurants = [A]');
  perform pg_temp.ok((public.cancel_reservation(v_id)->>'ok')::boolean, 'anulowanie przez obsługę');
  perform pg_temp.ok(public.cancel_reservation(v_id)->>'error' = 'not_found', 'drugie anulowanie → not_found');
  perform pg_temp.ok((select cancelled_by = v_staff and cancelled_at is not null from public.reservations where id = v_id), 'zapisano kto i kiedy anulował');
  perform pg_temp.ok((select cancelled_via = 'staff' from public.reservations where id = v_id), 'anulowanie z panelu: cancelled_via = staff');
  perform pg_temp.ok(exists (select 1 from public.get_available_slots(A, v_fri, 2, 120) where start_time = '19:00'), 'po anulowaniu 19:00 wraca');

  select count(*) into v_count from public.staff_reservations(A, v_fri);
  perform pg_temp.ok(v_count = 4, 'lista dnia: 4 rezerwacje (w tym anulowana), jest ' || v_count);
  perform pg_temp.ok(exists (select 1 from public.staff_reservations(A, v_fri) where start_time = '19:00' and end_time = '21:00' and table_label = 'test-4' and comment = 'przy oknie'),
    'lista dnia: godziny lokalne, stolik, komentarz');
  perform pg_temp.ok(exists (select 1 from public.staff_reservations(A, v_fri) where status = 'cancelled' and cancelled_via = 'staff'),
    'lista dnia: kto odwołał');

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
    perform public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Hacker', '+48600100299', 'h@example.com', null);
    v_anon_create := true;
  exception when insufficient_privilege then v_anon_create := false;
  end;

  begin
    perform count(*) from public.dining_tables;
    v_anon_tables := true;
  exception when insufficient_privilege then v_anon_tables := false;
  end;

  begin
    perform count(*) from public.restaurants;
    v_anon_rest := true;
  exception when insufficient_privilege then v_anon_rest := false;
  end;

  begin
    perform public.staff_reservations(A, v_fri);
    v_anon_day := true;
  exception when insufficient_privilege then v_anon_day := false;
  end;

  select count(*) into v_anon_slots from public.get_available_slots(A, v_fri, 2, 120);
  v_anon_cfg := public.get_public_config(A);
  execute 'reset role';

  perform pg_temp.ok(not v_anon_read_res, 'anon: brak odczytu reservations');
  perform pg_temp.ok(not v_anon_create,   'anon: brak wywołania create_reservation');
  perform pg_temp.ok(not v_anon_tables,   'anon: brak odczytu dining_tables');
  perform pg_temp.ok(not v_anon_rest,     'anon: brak odczytu listy restauracji');
  perform pg_temp.ok(not v_anon_day,      'anon: brak listy dnia');
  perform pg_temp.ok(v_anon_slots > 0,    'anon: wolne godziny dostępne');
  perform pg_temp.ok((v_anon_cfg->'settings'->>'max_party')::int = 8, 'anon: odczyt konfiguracji przez RPC');

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
  insert into public.reservations (restaurant_id, request_id, table_id, period, party_size, guest_name, guest_phone)
  select v_a, gen_random_uuid(), id, private.slot_period(v_today - 40, 12*60, 120, tz), 2, 'Stary', '+48600100205'
  from public.dining_tables where restaurant_id = v_a and label = 'test-2';

  perform private.purge_old_reservations();
  perform pg_temp.ok(not exists (select 1 from public.reservations where guest_name = 'Stary'), 'retencja usuwa rezerwacje sprzed 30+ dni');
  perform pg_temp.ok((select count(*) from public.reservations where restaurant_id = v_a) = 4,
    'retencja nie rusza przyszłych rezerwacji');

  -- ------------------------------------------------------------------
  -- 9. Odwołanie przez gościa (link z maila)
  -- ------------------------------------------------------------------
  v_res := public.create_reservation(A, gen_random_uuid(), v_fri, '13:00', 2, 120, 'Ewa', '+48600100206', 'ewa@example.com', null);
  perform pg_temp.ok((v_res->>'created')::boolean, 'Ewa: rezerwacja utworzona ' || v_res::text);
  perform pg_temp.ok((v_res->>'cancel_min_before')::int = 120, 'odpowiedź podaje termin odwołania');
  perform pg_temp.ok((v_res->>'cancellable')::boolean, 'rezerwacja za kilka dni: odwołanie z maila możliwe');
  v_token := v_res->>'cancel_token';
  perform pg_temp.ok(
    (select cancel_token_hash = sha256(convert_to(v_token, 'UTF8')) from public.reservations where guest_name = 'Ewa'),
    'w bazie jest skrót tokenu, nie token');
  perform pg_temp.ok(not exists (select 1 from public.get_available_slots(A, v_fri, 2, 120) where start_time = '13:00'),
    '13:00 dla pary zajęte (stolik 2-os. ma Darek, 4-os. Ewa)');

  perform pg_temp.ok(public.reservation_by_token(repeat('0', 64))->>'error' = 'not_found', 'obcy token → not_found');
  perform pg_temp.ok(public.reservation_by_token('abc')->>'error' = 'not_found',           'śmieci zamiast tokenu → not_found');
  perform pg_temp.ok(public.reservation_by_token(null)->>'error' = 'not_found',            'brak tokenu → not_found');
  perform pg_temp.ok(public.cancel_reservation_by_token(upper(v_token))->>'error' = 'not_found', 'token wielkimi literami → not_found');

  perform pg_temp.ok(
    (select (private.guest_view(r, lower(r.period) - interval '121 minutes')->>'cancellable')::boolean
       and not (private.guest_view(r, lower(r.period) - interval '120 minutes')->>'cancellable')::boolean
     from public.reservations r where guest_name = 'Ewa'),
    'odwołanie możliwe do 2 godz. przed, dokładnie 2 godz. przed już nie');

  execute 'set local role anon';
  v_anon_view   := public.reservation_by_token(v_token);
  v_anon_cancel := public.cancel_reservation_by_token(v_token);
  execute 'reset role';

  perform pg_temp.ok((v_anon_view->>'ok')::boolean
    and v_anon_view->'reservation'->>'time' = '13:00'
    and v_anon_view->'reservation'->>'deadline_time' = '11:00'
    and v_anon_view->'reservation'->>'deadline_date' = to_char(v_fri, 'YYYY-MM-DD')
    and (v_anon_view->'reservation'->>'cancellable')::boolean
    and not (v_anon_view->'reservation'->>'is_past')::boolean
    and not (v_anon_view->'reservation' ? 'guest_phone'),
    'anon z tokenem: podgląd bez telefonu ' || v_anon_view::text);
  perform pg_temp.ok((v_anon_cancel->>'ok')::boolean and v_anon_cancel->'reservation'->>'status' = 'cancelled',
    'anon z tokenem: odwołanie ' || v_anon_cancel::text);
  perform pg_temp.ok((select cancelled_via = 'guest' and cancelled_by is null and cancelled_at is not null from public.reservations where guest_name = 'Ewa'),
    'zapisano, że odwołał gość');
  perform pg_temp.ok(exists (select 1 from public.get_available_slots(A, v_fri, 2, 120) where start_time = '13:00'), 'po odwołaniu 13:00 wraca');
  perform pg_temp.ok(public.cancel_reservation_by_token(v_token)->>'error' = 'already_cancelled', 'drugie odwołanie → already_cancelled');
  perform pg_temp.ok(public.reservation_by_token(v_token)->'reservation'->>'status' = 'cancelled', 'podgląd po odwołaniu pokazuje status');

  -- rezerwacja za 90 minut: za późno na odwołanie z maila
  insert into public.reservations (restaurant_id, request_id, table_id, period, party_size, guest_name, guest_phone, guest_email, cancel_token_hash)
  select v_a, gen_random_uuid(), id, tstzrange(now() + interval '90 minutes', now() + interval '210 minutes'), 2, 'Zenon', '+48600100207',
         'zenon@example.com', sha256(convert_to(repeat('a', 64), 'UTF8'))
  from public.dining_tables where restaurant_id = v_a and label = 'test-2'
  returning id into v_now_id;
  perform pg_temp.ok(not (public.reservation_by_token(repeat('a', 64))->'reservation'->>'cancellable')::boolean, 'za 90 min: podgląd mówi, że za późno');
  perform pg_temp.ok(public.cancel_reservation_by_token(repeat('a', 64))->>'error' = 'too_late', 'za 90 min: odwołanie → too_late');
  perform pg_temp.ok((select status = 'confirmed' from public.reservations where id = v_now_id), 'za 90 min: rezerwacja nadal aktywna');

  -- ------------------------------------------------------------------
  -- 10. Izolacja restauracji (RSaaS)
  -- ------------------------------------------------------------------
  -- Sala B jest pusta mimo rezerwacji w A.
  select array_agg(start_time) into v_slots from public.get_available_slots(B, v_fri, 2, 120);
  perform pg_temp.ok(cardinality(v_slots) = 21, 'B: rezerwacje A nie zajmują godzin B, jest ' || coalesce(cardinality(v_slots), 0));

  -- Limit na numer liczy się osobno: Darek ma 2 rezerwacje w A, w B może zarezerwować.
  v_res := public.create_reservation(B, gen_random_uuid(), v_fri, '19:00', 2, 120, 'Darek', '+48600100204', 'darek@example.com', null);
  perform pg_temp.ok((v_res->>'ok')::boolean and v_res->'restaurant'->>'name' = 'Test B', 'B: limit numeru z A nie obowiązuje w B ' || v_res::text);
  v_b_id := (v_res->'reservation'->>'id')::uuid;
  perform pg_temp.ok((select t.restaurant_id = v_b from public.reservations r join public.dining_tables t on t.id = r.table_id where r.id = v_b_id),
    'B: rezerwacja dostała stolik B');

  -- request_id z A użyty w B nie zwraca cudzej rezerwacji.
  perform pg_temp.ok(public.create_reservation(B, v_req, v_fri, '19:00', 2, 120, 'Anna', '+48600100200', 'anna@example.com', null)->>'error' = 'invalid',
    'request_id rezerwacji A podany w B → invalid (bez wycieku danych A)');

  -- Złożony klucz obcy: rezerwacja B nie może wskazać stolika A.
  begin
    insert into public.reservations (restaurant_id, request_id, table_id, period, party_size, guest_name, guest_phone)
    select v_b, gen_random_uuid(), id, private.slot_period(v_sun, 12*60, 90, tz), 2, 'X', '+48600100298'
    from public.dining_tables where restaurant_id = v_a and label = 'test-2';
    raise exception 'FAIL: rezerwacja B na stoliku A przeszła';
  exception when foreign_key_violation then
    null;
  end;

  -- Obsługa A nie widzi i nie rusza B.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  begin
    perform public.staff_reservations(B, v_fri);
    raise exception 'FAIL: obsługa A pobrała listę dnia B';
  exception when insufficient_privilege then
    null;
  end;
  perform pg_temp.ok(public.cancel_reservation(v_b_id)->>'error' = 'not_found', 'obsługa A nie anuluje rezerwacji B');
  perform pg_temp.ok((select status = 'confirmed' from public.reservations where id = v_b_id), 'rezerwacja B nienaruszona');
  execute 'set local role authenticated';
  select count(*) into v_count from public.reservations where restaurant_id = v_b;
  execute 'reset role';
  perform pg_temp.ok(v_count = 0, 'obsługa A: RLS ukrywa wiersze B');

  -- Obsługa B widzi tylko B.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count from public.reservations where restaurant_id <> v_b;
  execute 'reset role';
  perform pg_temp.ok(v_count = 0, 'obsługa B: RLS ukrywa wiersze A');
  select count(*) into v_count from public.staff_reservations(B, v_fri);
  perform pg_temp.ok(v_count = 1, 'obsługa B: lista dnia B = 1 rezerwacja, jest ' || v_count);

  -- Broadcast do kanału właściwej restauracji (tylko na Supabase, gdzie istnieje realtime.messages).
  -- realtime.messages jest partycjonowana per dzień; partycje zakłada usługa Realtime, gdy ktoś się połączy.
  -- Na świeżym projekcie ich nie ma → realtime.send tylko ostrzega, a test kanału trzeba zrobić w przeglądarce.
  if to_regclass('realtime.messages') is not null
     and exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                 where i.inhparent = 'realtime.messages'::regclass
                   and c.relname = 'messages_' || to_char(now() at time zone 'UTC', 'YYYY_MM_DD')) then
    -- W jednej transakcji inserted_at jest identyczne, więc liczymy wiadomości per kanał.
    -- B miało dokładnie jedną zmianę (rezerwacja Darka); A wiele.
    execute $q$select count(*) from realtime.messages where topic = 'availability:rsaas-test-b'$q$ into v_count;
    perform pg_temp.ok(v_count = 1, 'broadcast: kanał B dostał 1 wiadomość, jest ' || v_count);
    execute $q$select count(*) from realtime.messages where topic = 'availability:rsaas-test-a'$q$ into v_count;
    perform pg_temp.ok(v_count > 1, 'broadcast: zmiany A idą do kanału A, jest ' || v_count);
    execute $q$select count(*) from realtime.messages where topic = 'availability'$q$ into v_count;
    v_topic := v_count::text;
    perform pg_temp.ok(v_count = 0, 'broadcast: nic nie idzie do starego wspólnego kanału, jest ' || v_topic);
  else
    raise notice 'Brak dzisiejszej partycji realtime.messages — pomijam test kanału broadcast (sprawdź w przeglądarce).';
  end if;

  perform set_config('request.jwt.claims', '', true);

  raise notice 'WSZYSTKIE TESTY OK';
end;
$$;

rollback;
