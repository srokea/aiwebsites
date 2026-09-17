-- =====================================================================
-- Dane startowe. Uruchom raz, po migracjach 0001–0003.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reguły rezerwacji
-- DO POTWIERDZENIA Z KLIENTEM: min. wyprzedzenie, horyzont, maks. grupa online,
-- limit aktywnych rezerwacji na numer, retencja danych.
-- ---------------------------------------------------------------------
insert into public.settings (
  id, timezone, slot_interval_min, durations_min, default_duration_min,
  max_party, booking_horizon_days, min_lead_min, max_active_per_phone, retention_days,
  rules_text
) values (
  true, 'Europe/Warsaw', 30, '{90,120,150,180}', 120,
  8, 60, 60, 2, 30,
  -- PLACEHOLDER: treść zasad dośle klient. Poniżej wyłącznie reguły, które system faktycznie egzekwuje.
  E'Stolik rezerwujesz na wybrany czas: 1,5, 2, 2,5 albo 3 godziny.\n'
  || E'Online przyjmujemy rezerwacje dla grup do 8 osób, najpóźniej godzinę przed przyjściem i najwcześniej 60 dni naprzód.\n'
  || E'Na jeden numer telefonu możesz mieć jednocześnie dwie aktywne rezerwacje.\n'
  || E'Jeśli chcesz zmienić lub odwołać rezerwację, zadzwoń: 531 122 360.'
)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- Godziny otwarcia z brief.md (ISO: 1 = poniedziałek)
-- ---------------------------------------------------------------------
insert into public.opening_hours (weekday, opens_min, closes_min) values
  (1, 12*60, 23*60),   -- pon 12:00–23:00
  (2, 12*60, 23*60),   -- wt
  (3, 12*60, 23*60),   -- śr
  (4, 12*60, 23*60),   -- czw
  (5, 12*60, 24*60),   -- pt  12:00–00:00
  (6, 12*60, 24*60),   -- sob 12:00–00:00
  (7, 12*60, 22*60)    -- nd  12:00–22:00
on conflict (weekday) do update
  set opens_min = excluded.opens_min, closes_min = excluded.closes_min;


-- ---------------------------------------------------------------------
-- Stoliki
-- PLACEHOLDER — PRZYKŁADOWA SALA, NIE PRAWDZIWA. Do podmiany na listę od klienta
-- (oznaczenie + liczba miejsc). Najmniejsza wolna, pasująca grupa dostaje stolik
-- z najmniejszą liczbą miejsc; min_party chroni duże stoły przed parami.
-- Największy stolik musi mieć co najmniej settings.max_party miejsc,
-- inaczej największe grupy nigdy nie zobaczą wolnych godzin.
-- ---------------------------------------------------------------------
insert into public.dining_tables (label, seats, min_party, sort) values
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
on conflict (label) do nothing;
