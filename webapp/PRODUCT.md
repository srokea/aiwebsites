# Product

## Register

product

## Users

Sylwester i Nikodem (plus konto admina) — dwuosobowy zespół MMates, który cold-calluje lokalne firmy usługowe (fryzjerzy, kosmetyczki, barberzy…) i sprzedaje im strony internetowe w abonamencie. Pracują głównie na komputerze (laptop/monitor), godzinami, w trakcie rozmów telefonicznych; telefon tylko okazjonalnie. W czasie rozmowy liczy się każda sekunda: trzeba szybko znaleźć leada, zmienić status, umówić Google Meet, dopisać notatkę.

## Product Purpose

Cold Call Tracker zastępuje arkusz Google Sheets: nisze i leady z importu CSV, statusy rozmów, schemat rozmowy z panelem leada, kalendarz Meetów i oddzwonień (z synchronizacją do iCloud), klienci i umowy z rachunkami, Kasa (przychody/koszty), mapa obchodu i karty NFC z opiniami. Sukces = więcej dopiętych klientów przy mniejszym tarciu: nic nie ginie, nic nie wymaga szukania, terminy same lądują w kalendarzu.

## Brand Personality

Spokojny, szybki, dopracowany. Wewnętrzne narzędzie dwóch osób, więc ton jest koleżeński i konkretny (polski, bez korpo-mowy). Wizualnie: Apple „Liquid Glass" na ciemnej bazie — szkło jako warstwa sterowania i paneli nad żywym, głębokim tłem; odrobina radości w momentach sukcesu (dopięty klient), poza tym narzędzie ma znikać w zadaniu.

## Anti-references

- Generyczny „SaaS dashboard" z identycznymi kafelkami z ikonką i wielką liczbą.
- Szkło jako dekoracja wszystkiego naraz (rozmyte każde pole i wiersz tabeli) kosztem czytelności i płynności.
- Neonowy „gamer/crypto" dark mode, gradientowy tekst, krzykliwe glow.
- Zmienianie układu i nawyków: przyciski i miejsca zostają tam, gdzie są.

## Design Principles

1. Zadanie przed efektem — status leada, termin i telefon czytelne w sekundę, także w trakcie rozmowy.
2. Szkło ma hierarchię: tło → panele treści → pływające sterowanie (topbar, popovery, modale, toasty). Im wyżej, tym jaśniej i bardziej „soczewkowo".
3. Kolor niesie znaczenie — statusy, osoby, nisze i stany; reszta to spokojne, przejrzyste neutralne.
4. Ten sam słownik komponentów na każdej stronie: jeden kształt przycisku, jeden dropdown, jeden kalendarzyk.
5. Ruch tylko jako informacja zwrotna (naciśnięcie, otwarcie, zapis) — krótki, miękki, z wersją bez animacji.

## Accessibility & Inclusion

Kontrast tekstu ≥ 4.5:1 mimo przezroczystości (szkło musi mieć wystarczająco ciemną bazę pod tekstem), widoczny focus z klawiatury, `prefers-reduced-motion` wyłącza animowane tło i drgania, `prefers-reduced-transparency` daje pełne, nieprzezroczyste powierzchnie. Statusy nie tylko kolorem — zawsze z etykietą.
