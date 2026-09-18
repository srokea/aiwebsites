# Brief — Usługi Ogrodnicze Tomaszów Mazowiecki (Green Garden)

## Wariant strony
**Basic Website.** Brak Booksy, brak rezerwacji online. Główne CTA: telefon (`tel:`) + linki social (FB/IG/TikTok). Kontekst od klientki: obecnie każdy telefon do męża kończy się tym, że musi ręcznie wysyłać zdjęcia realizacji przez telefon — strona ma być "większą wizytówką", która to zastąpi.

## Dane firmy
- **Nazwa:** Usługi Ogrodnicze Tomaszów Mazowiecki (marka/szyld: Green Garden — Szymon Iskierka)
- **Adres:** Cisowa 7, 97-200 Tomaszów Mazowiecki
- **Telefon:** 517 960 219

## Godziny otwarcia
| Dzień | Godziny |
|---|---|
| Poniedziałek | 08:00–17:00 |
| Wtorek | 08:00–17:00 |
| Środa | 08:00–17:00 |
| Czwartek | 08:00–17:00 |
| Piątek | 08:00–17:00 |
| Sobota | 09:00–13:00 |
| Niedziela | Zamknięte |

## Social media
- **Facebook:** https://www.facebook.com/GreenGardenSzymonIskierka
- **Instagram:** https://www.instagram.com/ogrody_tomaszow
- **TikTok:** https://www.tiktok.com/@uslugi.ogrodnicze_tm

## Bio (źródło: FB)
"Profesjonalne usługi ogrodnicze! 💚"

## Usługi (lista z bio FB — przepisana dosłownie)
- Pielęgnacja roślin
- Pielęgnacja trawników
- Zakładanie trawników z rolki
- Systemy automatycznego nawadniania
- Sadzenie drzew i krzewów
- Drobne brukarstwo
- Usługi glebogryzarką separacyjną oraz kosiarką bijakową

## Cennik
**Brak stałego cennika — DO POTWIERDZENIA z klientką.** Usługi ogrodnicze zwykle są wyceniane indywidualnie (za m², zakres prac, dojazd), nie w stałym cenniku jak u fryzjera. Decyzja: zamiast tabeli cen, strona pokazuje listę usług z krótkimi opisami + wyraźne CTA "Zadzwoń po bezpłatną wycenę" / "Poproś o wycenę". To nie jest placeholder do uzupełnienia — to świadomy wybór formatu dla tej branży, chyba że klientka jednak poda orientacyjne widełki cenowe (wtedy do dodania).

## Opinie
**Klientka wprost:** mają bardzo mało opinii, bo mało kto je zostawia. Decyzja: NIE robimy sekcji z cytatami/placeholderami opinii (bo nie ma treści ani nawet potwierdzonych statystyk). Zamiast tego — duża, wyróżniająca się sekcja z CTA zachęcającym do zostawienia opinii (link do Google/FB), żeby sama zachęta była produktem tej sekcji, nie namiastką prawdziwych opinii.

**DO POTWIERDZENIA:** czy mają jakąkolwiek średnią ocenę/liczbę opinii z Google lub FB choćby w skromnej wysokości — jeśli tak, dodać jako mały trust badge obok CTA.

## Wariant motywu i styl wizualny
**Motyw: jasny.** Override per charakter fizycznej usługi (nie per nisza "rzemieślnicza" domyślnie ciemna) — materiały klientki (zdjęcia efektów: świeże trawniki, zielone ogrody, słoneczne ujęcia) są zdecydowanie "dzienne" i czyste, jasny motyw podkreśla świeżość i naturalność efektu usługi lepiej niż ciemne tło. Do udokumentowania w DESIGN.md jako nowy override per klient.

**Akcent: zielony**, wyprowadzony z koszulek zespołu / logo firmy widocznych na zdjęciu grupowym (zespół w firmowych zielonych koszulkach z logo). To świadomy, rozpoznawalny wybór marki klienta (branding zespołu), nie dowolny wybór słowny — tematycznie spójny z niszą ogrodniczą.
**Claude Code: dostrój dokładny hex zieleni bezpośrednio z pliku logo/koszulek w photos/, nie z przybliżenia poniżej.** Orientacyjnie (ocena wizualna z czatu, do weryfikacji): `~#4A7C3C` (zieleń trawy/liści, stonowana, nie neonowa). Sprawdzić kontrast WCAG AA na jasnym tle — jeśli zbyt jasny/nasycony do tekstu, użyć tylko na CTA/akcentach, nie na dużych powierzchniach tekstowych.

To pierwszy klient tej niszy (usługi ogrodnicze) w agencji — nie ma jeszcze potwierdzonego wzorca kodu do naśladowania, ten projekt go ustanawia.

## Hero — zdjęcie
Zdjęcie lotnicze (z drona) — dom z rozległym, świeżo położonym trawnikiem z rolki, oczko wodne w kadrze, przycięty żywopłot, panele słoneczne na dachu. Bardzo silny, "wow" dowód efektu usługi (zakładanie trawników z rolki) — najlepszy dostępny materiał na pierwsze wrażenie.

**Użycie:** pełne tło hero na całą szerokość/wysokość sekcji, z przyciemniającym overlayem pod tekst nagłówka i CTA (zgodnie z hierarchią czytelności — tekst i przycisk muszą mieć WCAG AA kontrast na overlayu).

**Plik:** klientka doda go do `clients/sklepy/active/uslugi-ogrodnicze/photos/` razem z resztą zdjęć (ma około 50 zdjęć do przejrzenia). Nazwa robocza do nadania: `hero-lotnicze-trawnik.jpg` (lub zbliżona, bez spacji/nawiasów).

## Pozostałe zdjęcia (galeria, zespół, "o nas")
**DO POTWIERDZENIA — folder `photos/` na razie pusty.** Klientka ma ok. 50 zdjęć do przejrzenia; wybór do galerii/sekcji "o nas" nastąpi w kolejnym kroku, po ich przejrzeniu. Nie zakładać z góry których dokładnie użyć poza hero.

Dwa zdjęcia widziane na czacie jako kontekst (nie sklasyfikowane jeszcze jako finalne assety, czekają na decyzję po przejrzeniu pełnego zbioru):
- Zdjęcie ogrodu prywatnego (trawnik, meble ogrodowe, murowany kominek/grill, girlanda świateł, drewniany płot) — kandydat na galerię realizacji, jeśli to praca tej firmy.
- Zdjęcie zespołu (3 osoby w zielonych koszulkach z logo, na pomarańczowym mini-traktorze z osprzętem, teren w trakcie prac ziemnych przy stawie) — silny kandydat do sekcji "o nas"/zespół, pokazuje sprzęt wspomniany w usługach (glebogryzarka).

**Do ustalenia przy kolejnym przeglądzie:** ile realnych realizacji da się pokazać w galerii, czy są ujęcia "przed/po", czy są zdjęcia właściciela/zespołu osobno od zdjęć sprzętu w akcji.

## Ton / copy
- Liczba mnoga: **"Pracujemy"** — na zdjęciu zespołu widać min. 3 osoby w firmowych koszulkach, to nie jednoosobowa działalność.
- Zwracanie się do klientów strony: neutralnie (usługi B2C/B2B mieszane — właściciele domów), nie per Pani/Pan jak przy branżach beauty, jeśli treść nie zwraca się bezpośrednio do jednej osoby — **DO POTWIERDZENIA z klientką ton "o nas"** (czy pisać z perspektywy Szymona jako właściciela, czy całego zespołu).
- Zero wymyślonych treści opinii, cen, realizacji.
- Max 2–3 myślniki (—) na stronę.
- Zero przepraszających wypełniaczy ("wkrótce", "w przygotowaniu") — dotyczy też cennika i galerii, jeśli assety jeszcze nie są gotowe: użyć neutralnego dashed placeholder bez tekstu tłumaczącego.

## Foldery
`clients/sklepy/active/uslugi-ogrodnicze/photos/` — obecnie pusty, czeka na przegląd ~50 zdjęć klientki + hero z czatu.

## Braki / do potwierdzenia z klientką (podsumowanie)
1. Czy mają jakąkolwiek średnią ocenę / liczbę opinii (Google, FB) choćby skromną — wpłynie na sekcję opinii.
2. Czy mają orientacyjne widełki cenowe za konkretne usługi (np. koszenie za m²) — jeśli tak, dodać zamiast czystego CTA "wycena".
3. Wybór finalnych zdjęć do galerii i "o nas" z pełnego zbioru ~50 zdjęć.
4. Ton "o nas" — z perspektywy właściciela czy zespołu (roboczo: zespół, "Pracujemy").
5. Dokładny hex zieleni akcentu — do dostrojenia przez Claude Code bezpośrednio z pliku logo/koszulek, nie z przybliżenia w tym briefie.
