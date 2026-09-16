# Brief: Alticcio (Gdańsk)

## ⚠️ Ten klient wykracza poza standardowy model agencji

- **Nie mieści się w wariantach Basic/Website+/Pro+** — to bespoke projekt: rozbudowany front-end + osobno budowany, customowy system rezerwacji (Supabase + Cloudflare Pages, bez Booksy). Świadomy wyjątek od zasady "trzy warianty, nic customowego" z AI_WEB_AGENCY_CONTEXT.md — ustalony wprost przez użytkownika dla tego klienta.
- **Nisza inna niż kosmetyczki** — restauracja/wine bar. Folder: `clients/sklepy/active/alticcio/`, nie `clients/kosmetyczki/`.
- **Branding klienta całkowicie zastępuje paletę/styl agencji** — Alticcio ma już w pełni ukształtowaną, profesjonalną tożsamość wizualną (patrz niżej). Żaden ze Stylów 00–15 z STYLES.md nie jest tu punktem startowym — te style są skrojone pod niszę fryzjersko-kosmetyczną, nie pasują rejestrem do włoskiej restauracji z drapieżną, designerską identyfikacją. Z DESIGN.md zachowujemy tylko techniczne Named Rules (Two-Typeface, Flat-by-Default, WCAG, 44px), nie paletę ziemistą.
- **Ten brief dotyczy WYŁĄCZNIE front-endu.** System rezerwacji to osobny prompt do zrobienia później — tutaj zostaje jako wyraźna, oznaczona luka.

## Dane podstawowe

- **Nazwa:** Alticcio
- **Adres:** Plac Dominikański 1, 80-844 Gdańsk *(lokal w Hali Targowej w Gdańsku)*
- **Telefon:** 531 122 360
- **Facebook:** https://www.facebook.com/profile.php?id=61575473254882
- **Instagram:** https://www.instagram.com/alticciogdansk/

## Godziny

| Dzień | Godziny |
|---|---|
| Poniedziałek | 12:00–23:00 |
| Wtorek | 12:00–23:00 |
| Środa | 12:00–23:00 |
| Czwartek | 12:00–23:00 |
| Piątek | 12:00–00:00 |
| Sobota | 12:00–00:00 |
| Niedziela | 12:00–22:00 |

## Charakter marki

Nowoczesna włoska restauracja/wine bar — makarony robione na miejscu, pizza, aperitivo, obszerna karta win. Ton marki: pewny siebie, designerski, nocny/klubowy vibe połączony z rzemiosłem kuchni włoskiej ("A new kind of Italian", "The night starts here", "wine o'clock"). To NIE jest przytulna, rodzinna trattoria — to stylowe miejsce z ambicją, mocno zaprojektowany brand.

**Zespół w białych kucharskich uniformach z czerwonymi fartuchami** — widoczne na zdjęciach grupowych z otwarcia.

## Branding — paleta i typografia

**Paleta (z realnych materiałów klienta, logo + menu):**
- Czerwień marki: `~#C41E1E` — dokładnie dostroić z pliku logo w photos/
- Kremowe tło: `~#F5EFE3` — ciepły off-white, widoczny w logo i na menu
- Czerń: głębokie zdjęcia czarno-białe / czarne tło na części postów Instagram
- Akcenty na Instagramie: naprzemienne bloki pełnej czerwieni z białym kursywnym tekstem jako slajdy przejściowe między zdjęciami

**Logo (`photos/[logo].png`):** „ALTICCIO" w agresywnym, geometrycznym kroju o ciętych, ukośnych kształtach liter (przypomina cięcie nożem/ostrzem) — czerwony na kremowym tle. Odtworzyć dokładnie z pliku, nie improwizować podobnego kroju bez sprawdzenia.

**Typografia dodatkowa (tagline'e):** na Instagramie pojawia się elegancki, klasyczny serif kursywą do krótkich haseł na pełnoczerwonych slajdach (np. „The night starts here.", „wine o'clock") — umiarkowany kontrast kreski, spokojny, edytorialny charakter, nie zbyt dekoracyjny. Najbliższe darmowe odpowiedniki z Google Fonts do wypróbowania (w kolejności prawdopodobieństwa dopasowania): **PT Serif Italic**, **Noto Serif Italic**, **Source Serif 4 Italic**. Żaden nie będzie identyczny z oryginałem — potraktuj jako najbliższe darmowe przybliżenie, nie 1:1 odtworzenie.

**Fotografia:** edytorialna, mocno stylizowana — dramatyczne oświetlenie, zbliżenia na makaron/pizzę/wino, ujęcia czarno-białe mieszane z kolorowymi, zdjęcia zespołu w akcji (gotowanie, nalewanie drinków). To wysoki poziom referencyjny — jeśli klient dośle własne zdjęcia w tej jakości, użyć ich; jeśli nie, nie improwizować fałszywego photoshootu w tym stylu.

## Zdjęcia w photos/

Tylko dwa realne assety:
- Logo „ALTICCIO" (czerwień na kremie)
- Zdjęcie karty/menu (do transkrypcji cennika, patrz niżej — nie osadzać jako obrazek, przepisać dane)

Reszta materiałów (siatka postów Instagram, zrzut inspiracji systemu rezerwacji) to wyłącznie referencja stylu do mojej analizy — nie są assetami na stronę. Jeśli trzeba będzie doprecyzować konkretny post/detal typograficzny, użytkownik może dosłać pojedyncze zbliżenia.

## System rezerwacji — PLACEHOLDER

⚠️ **Nie budować teraz.** Zostawić wyraźne miejsce na stronie (np. przycisk „Zarezerwuj stolik" prowadzący na razie do numeru telefonu/formularza kontaktowego), z komentarzem w kodzie że docelowo zostanie podmienione na osobno budowany system.

Kontekst na przyszłość (osobny prompt): prosta aplikacja webowa, dwie części — (1) strona gościa: kalendarz + liczba osób + sloty godzinowe + dane kontaktowe, rezerwacja znika natychmiast po zajęciu; (2) panel właściciela: lista rezerwacji dnia, dane gości, anulowanie, logowanie email+hasło. Stack: HTML/JS + Supabase (baza, realtime, autoryzacja) + Cloudflare Pages, zero kosztów utrzymania na darmowych planach. Inspiracja wizualna systemu rezerwacji: to.gather (ciemny motyw, duży kalendarz, przyciski liczby gości/czasu/godziny) — użytkownik ma zrzut ekranu tego systemu jako punkt odniesienia UX.

## Menu / Cennik (źródło: zdjęcie karty klienta)

### Wina białe (kieliszek / butelka)

| Wino | Kraj / szczep | Kieliszek | Butelka |
|---|---|---|---|
| Spier Discover Medium Sweet | RPA, Chenin Blanc | 19 PLN | 95 PLN |
| Casa Solis Chardonnay | Chile, Chardonnay | 22 PLN | 110 PLN |
| Canyon Road Pinot Grigio | USA (Kalifornia), Pinot Grigio | 26 PLN | 128 PLN |
| Pulpo Sauvignon Blanc | Nowa Zelandia, Sauvignon Blanc | 30 PLN | 146 PLN |
| Nocturne Viorica Crudo | Mołdawia, Viorica | — | 161 PLN |
| Crudo Catarratto Zibibbo | Włochy (Sycylia), Catarratto/Zibibbo | — | 190 PLN |
| Penfolds Autumn Riesling | Australia, Riesling | — | 313 PLN |
| Jean Leon Chardonnay | Hiszpania, Chardonnay | — | 231 PLN |

### Wina czerwone (kieliszek / butelka)

| Wino | Kraj / szczep | Kieliszek | Butelka |
|---|---|---|---|
| Casa Solis Carmenere | Chile, Carmenère | 19 PLN | 95 PLN |
| White Zinfandel | USA (Kalifornia), Zinfandel | 26 PLN | 128 PLN |
| Canyon Road Merlot | USA (Kalifornia), Merlot | 26 PLN | 128 PLN |
| Nocturne Rara Neagra | Mołdawia, Rara Neagră | 34 PLN | 161 PLN |
| Mauro Primitivo | Włochy, Primitivo | 34 PLN | 170 PLN |
| Jean Leon Merlot | Hiszpania, Merlot | — | 237 PLN |
| Penfolds Shiraz | Australia, Shiraz | — | 236 PLN |

### Wina musujące

| Wino | Kieliszek | Butelka |
|---|---|---|
| Lamia 0.0% | 30 PLN | 148 PLN |
| Lamia Prosecco | 33 PLN | 161 PLN |
| Palmer La Reserve (Szampania) | — | 862 PLN |

### Piwa

| Piwo | Cena |
|---|---|
| Peroni | 23 PLN |
| Peroni 0% | 23 PLN |

### Napoje bezalkoholowe

| Napój | Cena |
|---|---|
| Crodino Spritz | 39 PLN |
| Cappy Lemoniada Cytrusowa | 23 PLN |
| Coca-Cola / Coca-Cola Zero | 15 PLN |
| Sprite / Fanta | 15 PLN |
| Cappy Sok Pomarańczowy | 23 PLN |
| Cappy Nektar Grejpfrutowy | 23 PLN |
| Sok świeżo wyciskany pomarańczowy | 25 PLN |
| Burn Energy Drink | 19 PLN |
| Fuze Tea Cytrynowe | 26 PLN |
| Fuze Tea Brzoskwinia Hibiskus | 26 PLN |
| 3 Cents Tonic Water | 24 PLN |
| 3 Cents Mandarin & Bergamot Tonic | 24 PLN |
| San Pellegrino / Acqua Panna | 23 PLN |

### Aperitivo

| Drink | Opis | Cena |
|---|---|---|
| Cascara Spritz | Cascara / Pierre Ferrand Dry Curaçao Yuzu / cydr | 38 PLN |
| Alticcio Limoncello Spritz | Botega Limoncino / 3cents mandarin & bergamot / soda | 38 PLN |
| Alticcio Hugo Spritz | likier z kwiatu bzu / dill syrop / limonka / mięta / Lamia prosecco | 38 PLN |
| Garibaldi Spritz | Campari / pomarańcza / kwiat pomarańczy / Lamia prosecco | 38 PLN |
| Jasmine Peach Spritz | likier brzoskwiniowy / jaśmin / Lamia prosecco | 38 PLN |
| Aperol Spritz | Aperol / Lamia prosecco / soda | 36 PLN |
| Americano | Campari / Dolin Rouge Vermouth / kwiat pomarańczy / soda | 32 PLN |
| Sarti Sbagliato | Sarti / Dolin Dry Vermouth / Lamia prosecco | 32 PLN |
| Bellini | brzoskwinia / Lamia prosecco | 34 PLN |
| Rubino | Campari / cacao / wiśnia / gryka | 39 PLN |

### Herbaty

Harney & Sons, Daily, Green, English Breakfast, Sunny Sencha, Fresh Berries, Rooibos Orange Melody — 18 PLN

### Kawy (ziarna z palarni COFFEELAB)

| Kawa | Cena |
|---|---|
| Espresso | 10 PLN |
| Espresso Doppio | 14 PLN |
| Cappuccino | 18 PLN |
| Americano | 17 PLN |
| Flat White | 20 PLN |
| Latte | 21 PLN |
| Espresso Tonic | 27 PLN |
| Espresso Tonic Luxardo Maraschino | 37 PLN |

*Mleko: 2%, bez laktozy, owsiane, grochowe, migdałowe.*

### Alkohole mocne

**Wódka:** Żubrówka Black 17 / Żubrówka Bison Grass 17 / Belvedere 35 / Beluga Noble Vodka 27 / Titos Vodka 27 PLN

**Gin:** Whitley Neill 19 / Hendricks 29 / Hendricks Another 32 / Gunpowder Citrus 33 / Gunpowder Orange 33 / Gunpowder Fig 33 PLN

**Tequila:** Jose Cuervo Silver 19 / Jose Cuervo Reposado 21 / 1800 Silver 26 / 1800 Reposado 28 / 1800 Anejo 29 / Clase Azul Plata 85 PLN

**Whisky Scotch:** Glenfiddich 12 — 37 / Highland Park 12 — 37 PLN
**Bourbon:** Buffalo Trace 24 / Elijah Craig 33 PLN
**Irish:** Tullamore Dew 19 / Bushmills 10 — 27 PLN
**Reszta świata:** Nikka Days 30 / Nikka From The Barrel 37 PLN

**Cognac i Brandy:** Remy Martin VSOP 39 / Metaxa 12 — 31 / Metaca Grande Fine 37 PLN

**Rum:** Planteray Dark 19 / Planteray 3* — 21 / Mount Gay Eclipse 23 / Dictador 12 — 34 PLN

**Aperitif:** Campari 19 / Sarti 17 / Disaronno Amaretto 18 PLN

**Likiery:** Jagermeister 18 / Luxardo Maraschino 21 / Cointreau 23 PLN

## O nas / galeria

Brak treści „o nas" — klient dosyła później. Placeholder.

**Bez formalnej sekcji galerii** — zamiast osobnego modułu ze zdjęciami, zdjęcia potraw/drinków rozrzucone luźno między sekcjami tekstowymi na całej stronie (nie w jednej siatce). Traktuj to jako ogólny kierunek — dokładne rozmieszczenie użytkownik dopracuje sam edytując wynik.

**Inspiracja układu strony:** to.gather (restauracja w Gdańsku, ciemny motyw) — użytkownik rozważa (niepewnie) przejęcie struktury sekcji FAQ w podobnym stylu (pytania rozwijane, strzałka po prawej). Opcjonalne, nie twardy wymóg.

## Opinie

**Google:** 4,8/5 · 105 opinii. Treść opinii — użytkownik dosyła później.

