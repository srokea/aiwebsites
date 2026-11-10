Zbuduj stronę fotografki "Paulina Kotas Fotografia" wg `brief.md` w tym samym folderze (`clients/fotografowie/active/paulina-kotas-fotografia/`).

## Baza i punkt startowy
Workflow fotografów: sklonuj `clients/fotografowie/template` (jak przy Mama Fotograf) i podmień treść oraz branding. System samodzielnego dodawania zdjęć przez klientkę weź z szablonu bez przebudowy. Jeśli `template` go nie zawiera, użyj wersji z `clients/fotografowie/portfolio-template`. Jeśli system obsługuje kategorie, ustaw je na sześć typów sesji z briefu.

Nie kopiuj wyglądu Mama Fotograf ani innych klientów z szablonu: to ten sam region i podobne nisze, strona ma wyglądać jak osobna marka. Branding klientki wygrywa z domyślnymi tokenami agencji (brief: jasna baza + jeden zielony akcent marki, "modern zielono"). Kroje zostaw z szablonu, o ile nie gryzą się z zielenią. Skrypt z logo tylko w logo, nie jako kroj nagłówków (max 2 kroje na stronę).

Zieleń: dostrój dokładny hex z pliku logo/okładki w `photos/`, nie z przybliżenia `~#3F5F0A` w briefie. Jeden token zieleni na całą stronę (bez limonki z IG). Sprawdź WCAG AA na jasnym tle i dla białego tekstu na zielonych sekcjach.

## Traktowanie plików w photos/
Sprawdź faktyczną zawartość `photos/` i podfolderów, zanim cokolwiek zaprojektujesz. Sklasyfikuj każdy plik:
- **Asset (użyj):** realne zdjęcia z sesji (portfolio), portret Pauliny (do sekcji "o mnie"), czyste logo.
- **Referencja (nie wklejaj):** kolaż okładki FB z logo, zrzuty z Instagrama z interfejsem.
- **Nie używaj:** wszystko z domeny `gotowastrona98.pl` (cudze demo), stocki, grafiki producentów.

Hero i miniatury sekcji "Oferta" dobierz tak, by każdy typ sesji miał własne zdjęcie, jeśli takie jest w folderze. Zdjęć nie zgaduj ani nie wymyślaj: czego nie ma, zostaw jako dashed placeholder bez tekstu tłumaczącego. Nazwy plików ze spacjami lub nawiasami obsłuż bez ich psucia, napisz mi w odpowiedzi, które to były.

## Czego NIE kopiować z cudzego demo
Nie bierz nic z `gotowastrona98.pl`: ani tekstów, ani układu, ani zdjęć, ani usług. Ma tam wymyślone usługi (ślubna, narzeczeńska, wizerunkowa), fałszywe liczniki (0 / 0.0) i słowo "luksusowe". Usługi tylko z briefu.

## Struktura strony
Navbar (logo + telefon CTA zawsze widoczny) → Hero (najlepsze zdjęcie portfolio, nagłówek oparty na jej własnych słowach z bio, np. "Witaj w moim małym świecie fotografii", z podtytułem pozycjonującym "Fotograf Piotrków Trybunalski"; żadnego wymyślonego hasła sprzedażowego) → O mnie (pierwsza osoba, tekst z briefu, portret) → Oferta (sześć usług) → Portfolio z lightboxem i systemem uploadu → Opinie (Google 5,0 / 57, sześć cytatów dosłownie z briefu, link "zobacz wszystkie opinie w Google"; sekcja ma być wyeksponowana, tu klientka ma największą przewagę) → Kontakt (telefon, adres, godziny jako "Kontakt telefoniczny", mapa, FB/IG) → Stopka w zieleni. Minimum jedna pełna sekcja w zieleni poza stopką (np. opinie lub pasek CTA).

SEO: w title/H1/description użyj "Piotrków Trybunalski" (tak się pozycjonuje klientka), w danych strukturalnych realny adres Krzyżanów.

## Czego NIE robić
- Nie wstawiaj e-maila ani linku do Facebooka z briefu bez wyraźnej pewności: oba oznaczone jako niezweryfikowane. Jeśli ich brak, użyj tylko telefonu i Instagrama.
- Nie linkuj bookmy.art i nie dodawaj rezerwacji online (wariant Basic, szczegóły w briefie).
- Nie twórz sekcji cennika ani cen, nie wymyślaj opinii, dat ani statystyk poza tymi z briefu.
- Nie dopowiadaj ucinanego bio.
- Nie dodawaj sekcji "Regulamin", dopóki klientka go nie dośle.

## Screenshot i uwagi po buildzie
Zrób screenshot mobile i desktop. Sprawdź szczególnie:
- Czy zdjęcia dalej są bohaterem (strona jasna, zieleń tylko akcent i 1–2 sekcje), a nie "zielona strona ze zdjęciami".
- Kontrast zieleni i białego tekstu (AA).
- Czy strona wygląda inaczej niż Mama Fotograf.
- Czy sekcja opinii faktycznie się wyróżnia.
- Czy hero nie zawiera żadnej wymyślonej obietnicy.
