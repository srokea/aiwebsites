# Brief klienta — Salon Gracja

## Dane podstawowe

- **Nazwa:** Salon Fryzjersko-Kosmetyczno-Podologiczny "Gracja" (Paulina Bugalska)
- **Adres:** ul. Konstantego Koplina 1, 97-200 Tomaszów Mazowiecki
- **Telefon:** 602 586 970
- **Facebook:** https://www.facebook.com/salongracja/
- **Instagram:** brak
- **Booksy:** nie, klient nie chce Booksy

## Godziny otwarcia

| Dzień | Godziny |
|---|---|
| Poniedziałek | 10:00–13:00 |
| Wtorek | 09:00–17:00 |
| Środa | 09:00–17:00 |
| Czwartek | 09:00–17:00 |
| Piątek | 09:00–17:00 |
| Sobota | 08:00–14:00 |
| Niedziela | Zamknięte |

## Wariant strony

**Basic Website** — brak Booksy, brak informacji o chęci rezerwacji wprost na stronie, więc zakładamy brak jakiegokolwiek systemu rezerwacji online. CTA = "Zadzwoń" (`tel:602586970`) wszędzie tam, gdzie normalnie byłby przycisk rezerwacji.

> Jeśli to założenie jest błędne i klient jednak chce rezerwację online (Cal.com, wariant Pro+) — zatrzymaj się i zapytaj użytkownika przed budową, nie zakładaj Cal.com automatycznie.

## Charakter biznesu

Gabinet działa od lat (nie nowy start), oficjalny partner **KLAPP Cosmetics** i **MATIS PARIS** — pracuje na markach profesjonalnych/medycznych, nie na tanich kosmetykach drogeryjnych. To podnosi poprzeczkę wiarygodności wizualnej: strona ma czuć się jak gabinet, nie jak salonik fryzjerski z osiedla.

Trzy równorzędne filary usług — potraktuj je jako trzy główne kategorie na stronie, nie jako jedną listę:

1. **Fryzjerstwo**
2. **Kosmetologia i medycyna estetyczna** — KLAPP Cosmetics, MATIS PARIS, Laser PDT, Laser Light Sheer (depilacja/zabiegi laserowe), Mezoterapia mikroigłowa, Kwasy PQAge, BioRePeel
3. **Podologia** — SHELLAC CND (w kontekście podologii/paznokci)

Cennik: brak konkretnych cen od klienta — użyj widocznych placeholderów (np. "od — zł", wyraźnie oznaczonych jako do uzupełnienia), nie zmyślaj kwot.

## Styl wizualny

**Punkt startowy z lookbooka:** Styl 00-A (wariant glass-hero, portfolio "Egoist") — `portfolio/site-00a/`, https://fable5-portfolio.netlify.app/site-00a/ jako referencja techniki (nie kopiuj treści/layoutu 1:1, przejmij paletę i technikę).

### Paleta

| Rola | Wartość |
|---|---|
| Tło | `#FFFFFF` |
| Surface (sekcje naprzemienne) | `#F6F0F3` (chłodny pudrowy róż) |
| Tekst | `#221C19` |
| Tekst wygaszony | pochodna tekstu przy obniżonej krycia, zgodnie z tokenami DESIGN.md |
| Akcent (jedyny) | `#7E2C47` śliwka/burgund — CTA, gwiazdki opinii, aktywne stany, cienkie ramki złota... nie, ramki w kolorze akcentu. Używać oszczędnie (≤10% powierzchni) |

Uwaga: ten akcent leży poza standardową ziemistą pulą agencji — to świadomy wybór gotowego wariantu z katalogu STYLES.md (Styl 00-A), nie nowy, niezatwierdzony kolor.

### Typografia

- Display: **Bodoni Moda** (waga 500) — nagłówek hero, nazwy sekcji. Max jeden na stronę w hero.
- Body: **Work Sans** — cała reszta.
- Zero eyebrow-kickerów nad sekcjami (patrz DESIGN.md — The No-Eyebrow Rule).

### Motyw

Jasny. Zgodny z regułą niszy DESIGN.md niezależnie czy patrzeć na to jako fryzjerstwo damskie/uniseks, czy wellness/higiena — obie ścieżki dają jasny motyw.

## Struktura strony (punkt wyjścia, nie sztywny wymóg)

1. **Header** — sticky, frosted-glass jasny wariant, logo/nazwa po lewej, telefon jako wypełniony przycisk-CTA po prawej (zawsze widoczny, `tel:`).
2. **Hero** — pełnoekranowe zdjęcie zabiegu (patrz sekcja Zdjęcia niżej) pod wyśrodkowanym glass-panelem z nazwą, krótkim hasłem i CTA "Zadzwoń".
3. **Trzy filary usług** jako karty na surface (Fryzjerstwo / Kosmetologia i medycyna estetyczna / Podologia) — pod każdą kartą krótkie mini-dl z przykładowymi zabiegami i placeholderem ceny. Inspiracja strukturalna (nie kopiowanie 1:1): układ kategorii-kart z `inspo/gabinet-glamour.png`.
4. **Krótkie "o nas" / filozofia gabinetu** — jedno zdanie-manifest + 2-3 zdania o doświadczeniu i markach (KLAPP, MATIS), ton H2H, zero języka sprzedażowego.
5. **Galeria** — kwadratowe kafle 2×2. Jedno prawdziwe zdjęcie w `photos/`, reszta jako dashed placeholder (patrz DESIGN.md — Galeria).
6. **Opinie** — układ gotowy (karty na surface, gwiazdki w akcencie), treść wklei użytkownik ręcznie — zostaw czytelną strukturę do wypełnienia, nie generuj fikcyjnych opinii.
7. **Godziny + kontakt + mapa** — dwukolumnowo, mapa z lekkim różowym tintem pod motyw (zgodnie z regułą Map embed w DESIGN.md).
8. **Stopka** — z polityką prywatności (placeholder).

## Zdjęcia

- `photos/` — jedno zdjęcie zabiegu (makro, ciepłe światło, opaska z brandingiem "CHANTARELLE") — użyj jako hero. Prawdopodobnie związane z realną działalnością klienta (Chantarelle Laboratory Derm to ich partner szkoleniowy), ale niepotwierdzone 100% jako własność klienta — przy handoffie poproś Paulinę o potwierdzenie praw i o więcej realnych zdjęć (wnętrze salonu, zespół, zabiegi) do galerii i przyszłej podmiany hero.
- `inspo/` — screen `gabinetglamour_com` — LUŹNA inspiracja nastroju i struktury kategorii usług, NIE wzór do kopiowania układu 1:1.
- `anty-inspo/` — pusty.

## Uwagi dodatkowe

- Salon sprzedaje też biżuterię i kremy pielęgnacyjne stacjonarnie (źródło: stary wpis z 2019) — pomiń na stronie, chyba że klient to potwierdzi jako aktualne i chce to uwzględnić.
- Zero żargonu medycznego-strasznego — nazwy zabiegów tak, ale bez opisów klinicznych, które mogłyby niepokoić (to nadal lokalny gabinet, nie klinika szpitalna).
