-- =====================================================================
-- RSaaS — dodanie restauracji. Skopiuj, uzupełnij wartości oznaczone <…>, uruchom raz.
-- Plik idempotentny: ponowne uruchomienie aktualizuje dane, nie dubluje ich.
--
-- Przed uruchomieniem ustal z klientem (rsaas/README.md → „Nowa restauracja”):
--   stoliki (oznaczenie + miejsca + od ilu osób), maks. grupa online, godziny,
--   treść zasad, e-mail konta obsługi.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Restauracja. slug = to samo co RESTAURANT_SLUG w js/config.js i w zmiennych Cloudflare.
-- ---------------------------------------------------------------------
insert into public.restaurants (slug, name, address, phone) values
  ('alticcio', 'Alticcio', 'Hala Targowa, Plac Dominikański 1, 80-844 Gdańsk', '531 122 360')
on conflict (slug) do update
  set name = excluded.name, address = excluded.address, phone = excluded.phone;


-- ---------------------------------------------------------------------
-- 2. Reguły rezerwacji
-- DO POTWIERDZENIA Z KLIENTEM: min. wyprzedzenie, horyzont, maks. grupa online,
-- limit aktywnych rezerwacji na numer, retencja danych, odwołanie z maila.
-- ---------------------------------------------------------------------
insert into public.settings (
  restaurant_id, timezone, slot_interval_min, durations_min, default_duration_min,
  max_party, booking_horizon_days, min_lead_min, max_active_per_phone, retention_days,
  guest_cancel_min_before, rules_text
)
select id, 'Europe/Warsaw', 30, '{90,120,150,180}', 120,
  8, 60, 60, 2, 30,
  120,
  -- PLACEHOLDER: treść zasad dośle klient. Poniżej wyłącznie reguły, które system faktycznie egzekwuje.
  E'Stolik rezerwujesz na wybrany czas: 1,5, 2, 2,5 albo 3 godziny.\n'
  || E'Online przyjmujemy rezerwacje dla grup do 8 osób, najpóźniej godzinę przed przyjściem i najwcześniej 60 dni naprzód.\n'
  || E'Na jeden numer telefonu możesz mieć jednocześnie dwie aktywne rezerwacje.\n'
  || E'Jeśli chcesz zmienić lub odwołać rezerwację, zadzwoń: 531 122 360.'
from public.restaurants where slug = 'alticcio'
on conflict (restaurant_id) do update set
  timezone = excluded.timezone, slot_interval_min = excluded.slot_interval_min,
  durations_min = excluded.durations_min, default_duration_min = excluded.default_duration_min,
  max_party = excluded.max_party, booking_horizon_days = excluded.booking_horizon_days,
  min_lead_min = excluded.min_lead_min, max_active_per_phone = excluded.max_active_per_phone,
  retention_days = excluded.retention_days, guest_cancel_min_before = excluded.guest_cancel_min_before,
  rules_text = excluded.rules_text;


-- ---------------------------------------------------------------------
-- 3. Godziny otwarcia (ISO: 1 = poniedziałek; minuty od północy; 24*60 = do północy)
-- ⚠️ Te same godziny są w index.html strony (tabela + JSON-LD). Zmieniaj oba miejsca.
-- ---------------------------------------------------------------------
insert into public.opening_hours (restaurant_id, weekday, opens_min, closes_min)
select x.id, d.weekday, d.opens_min, d.closes_min
from public.restaurants x
cross join (values
  (1, 12*60, 23*60),   -- pon 12:00–23:00
  (2, 12*60, 23*60),   -- wt
  (3, 12*60, 23*60),   -- śr
  (4, 12*60, 23*60),   -- czw
  (5, 12*60, 24*60),   -- pt  12:00–00:00
  (6, 12*60, 24*60),   -- sob 12:00–00:00
  (7, 12*60, 22*60)    -- nd  12:00–22:00
) as d (weekday, opens_min, closes_min)
where x.slug = 'alticcio'
on conflict (restaurant_id, weekday) do update
  set opens_min = excluded.opens_min, closes_min = excluded.closes_min;
-- Dzień zamknięty = brak wiersza. Usuń go, jeśli był:
-- delete from public.opening_hours where restaurant_id = (select id from public.restaurants where slug = 'alticcio') and weekday = 1;


-- ---------------------------------------------------------------------
-- 4. Stoliki
-- PLACEHOLDER — PRZYKŁADOWA SALA, NIE PRAWDZIWA. Do podmiany na listę od klienta.
-- Najmniejsza wolna, pasująca grupa dostaje stolik z najmniejszą liczbą miejsc;
-- min_party chroni duże stoły przed parami. Największy stolik musi mieć co najmniej
-- settings.max_party miejsc, inaczej największe grupy nigdy nie zobaczą wolnych godzin.
-- Stolika z rezerwacjami nie usuwaj — ustaw active = false.
-- ---------------------------------------------------------------------
insert into public.dining_tables (restaurant_id, label, seats, min_party, sort)
select x.id, t.label, t.seats, t.min_party, t.sort
from public.restaurants x
cross join (values
  ('1',  2, 1, 1),
  ('2',  2, 1, 2),
  ('3',  2, 1, 3),
  ('4',  2, 1, 4),
  ('5',  2, 1, 5),
  ('6',  2, 1, 6),
  ('7',  4, 2, 7),
  ('8',  4, 2, 8),
  ('9',  4, 2, 9),
  ('10', 4, 2, 10),
  ('11', 6, 3, 11),
  ('12', 6, 3, 12),
  ('13', 8, 5, 13)
) as t (label, seats, min_party, sort)
where x.slug = 'alticcio'
on conflict (restaurant_id, label) do update
  set seats = excluded.seats, min_party = excluded.min_party, sort = excluded.sort;


-- ---------------------------------------------------------------------
-- 5. Konto obsługi. Najpierw: Authentication → Users → Add user (e-mail + hasło, Auto Confirm).
-- Jedna osoba może mieć kilka restauracji — wtedy po wierszu na każdą.
-- ---------------------------------------------------------------------
-- insert into public.staff (user_id, restaurant_id)
-- select u.id, x.id from auth.users u, public.restaurants x
-- where u.email = '<email-obslugi>' and x.slug = 'alticcio'
-- on conflict do nothing;


-- Kontrola: największy stolik ≥ max_party
do $$
declare v_ok boolean;
begin
  select max(t.seats) >= s.max_party into v_ok
  from public.restaurants x
  join public.settings s on s.restaurant_id = x.id
  join public.dining_tables t on t.restaurant_id = x.id and t.active
  where x.slug = 'alticcio'
  group by s.max_party;
  if v_ok is distinct from true then
    raise exception 'Największy aktywny stolik ma mniej miejsc niż max_party (albo brak stolików).';
  end if;
end;
$$;

commit;
