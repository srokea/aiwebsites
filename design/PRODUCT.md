# Product

## Register

brand

## Users

Dwie grupy, ale ta, dla której projektujemy design, to klienci końcowi lokalnych firm usługowych (nie właściciele firm, którzy zlecają stronę).

- **Kim są**: mieszkańcy okolicy szukający konkretnej usługi (fryzjer, salon kosmetyczny, masaż, dietetyk, trener personalny, korepetytor, event, detailing) — kolejność niszy rośnie sekwencyjnie, zaczynając od barberów/fryzjerów.
- **Kontekst użycia**: telefon, często w pośpiechu lub w trakcie decyzji "komu zadzwonić / kogo umówić" — porównują 2-3 opcje w okolicy. Trafiają na stronę z Google, Instagrama, Facebooka albo namiaru od znajomego.
- **Zadanie do wykonania**: szybko ocenić, czy ta firma jest wiarygodna (opinie, zdjęcia, cennik), sprawdzić godziny/lokalizację, i zadzwonić / napisać / zarezerwować wizytę (przez Booksy, jeśli klient go używa).
- **Emocje, jakie strona ma wywołać**: zaufanie, spokój decyzji ("to wygląda profesjonalnie i realnie"), brak wahania przed kontaktem. Nie ekscytacja czy "wow" — to nie jest produkt do zachwytu, tylko narzędzie budujące wiarygodność lokalnego usługodawcy.

## Product Purpose

Strona internetowa jako centrum zaufania i informacji dla lokalnej firmy usługowej — nie sklep, nie aplikacja, nie system rezerwacji per se (chyba że wariant Pro+).

- **Co to robi**: prezentuje ofertę, cennik, opinie, zdjęcia, dane kontaktowe firmy w prostej, mobilnej formie; kieruje do kontaktu (telefon/Booksy/formularz).
- **Dlaczego istnieje**: wiele lokalnych firm usługowych nie ma żadnej strony albo ma tylko Booksy/social media — strona konsoliduje widoczność i buduje zaufanie, którego sam profil Booksy/Instagram nie daje.
- **Model biznesowy za tym**: jedna prosta oferta (opłata startowa + stały abonament miesięczny), bez wielopoziomowych pakietów — to się przekłada na design: brak potrzeby komunikowania "poziomów" na stronie klienta, strona ma być prosta i szybka do zbudowania, nie przekombinowana.
- **Sukces wygląda tak**: właściciel firmy dostaje więcej telefonów/rezerwacji i czuje, że strona reprezentuje go lepiej niż brak strony lub goły profil Booksy.

## Brand Personality

Lokalny, prosty, godny zaufania.

- **Ton głosu**: H2H (human to human) — jakby lokalny znajomy budował stronę sąsiadowi, nie agencja marketingowa. Zero korpo-mowy, zero żargonu technicznego, zero języka sprzedażowego.
- **Nie agencja, tylko lokalny operator**: identyfikacja jako "młody lokalny buduje strony dla prawdziwych firm w okolicy", nie "software house" czy "startup".
- **Priorytet**: zaufanie i konwersja klienta końcowego nad efekciarstwem wizualnym. Strona ma działać, nie olśniewać.
- **Prostota jako wartość, nie kompromis**: "prosto i szybko" jest świadomym wyborem stylistycznym pasującym do lokalnego, uczciwego charakteru usługi — nie oszczędnością na jakości.

## Anti-references

Zdefiniowane w `web-design/SKILL.md` i `CLAUDE.md` — obowiązują na wszystkich stronach klientów bez wyjątku:

- **Estetyka SaaS/startupowa**: gradientowe hero z abstrakcyjnymi kształtami, loga "trusted by", dashboardowy UI. To lokalny biznes usługowy, nie aplikacja SaaS.
- **Typowe "AI tells"**: font Inter wszędzie, fioletowo-niebieskie gradienty, karty w kartach (nested cards), szary tekst na kolorowym tle, czysty czarny #000, duże zaokrąglone ikonki nad nagłówkami, animacje "bounce"/"elastic".
- **Ton sprzedażowy/korporacyjny** w treści strony — żadnego "Zrewolucjonizuj swój biznes" czy podobnego językowego przerostu.
- **Skomplikowane oferty na stronie** — jedna prosta propozycja wartości, bez tabel porównawczych planów cenowych z wieloma poziomami.
- **Elementy niezwiązane z briefem klienta** — nie dodawać sekcji ani funkcji, których klient nie prosił.

## Design Principles

1. **Zaufanie i konwersja ponad efekciarstwem.** Każda decyzja projektowa (kolor, animacja, layout) sprawdzana pod kątem: czy to buduje zaufanie i ułatwia kontakt, czy tylko wygląda ładnie.
2. **Mobile-first zawsze.** Klient końcowy ogląda stronę na telefonie w ruchu — projektuj i testuj od najmniejszego ekranu w górę, nie w dół.
3. **Prosto i szybko ponad perfekcyjnie.** Bez przekombinowania — jedna strona, jasny przekaz, minimalna liczba decyzji do podjęcia przez odwiedzającego.
4. **Jeden spójny system, mała zmienna per klient.** Typografia, odstępy, promienie, styl komponentów i "signature element" agencji są stałe; zmienia się tylko kolor akcentu dobrany do charakteru niszy klienta (w ramach ustalonej palety).
5. **Booksy jako narzędzie, strona jako centrum.** Gdy klient ma Booksy, strona go nie zastępuje ani nie ukrywa — integruje je widocznie jako część większej całości budującej zaufanie.

## Accessibility & Inclusion

Poziom bazowy: **WCAG AA** jako rozsądne minimum, bez formalnego audytu zgodności — dopasowane do zróżnicowanej wiekowo klienteli lokalnych firm usługowych (np. starsi klienci barberów/salonów fryzjerskich).

- Kontrast tekstu ≥4.5:1 dla tekstu podstawowego, ≥3:1 dla dużego/pogrubionego.
- Klikalne obszary (numer telefonu, CTA, linki) min. 44px na mobile.
- Alt-teksty dla zdjęć (nawet placeholderowych, opisowe nazwy).
- Czytelne rozmiary fontów bez polegania wyłącznie na kolorze do przekazania informacji.
- `prefers-reduced-motion` uwzględniony w każdej animacji.
