# STYLES.md — katalog stylów agencji

**Styl 00 (Default)** to punkt wyjścia dla standardowej produkcji klienckiej — zgodny z `/design/DESIGN.md`
i potwierdzony w kodzie u realnych klientów (Studio Fryzur Lidia, M.E.N.).
**Style 01–15** to warianty eksperymentalne z lookbooku (poligon 15 stron dla niszy fryzjerskiej),
do wyboru jako punkt startowy, gdy klient/projekt tego wymaga.
Podgląd wszystkich naraz: https://fable5-portfolio.netlify.app

---

## Styl 00 — Default (Rzemieślniczy szyld)
**Link:** brak / lokalne pliki: `clients/studio-fryzur-lidia/index.html`, `clients/M.E.N./index.html`
**Vibe:** Spokojna, wiarygodna elegancja lokalnego rzemiosła — strona jak dobrze zrobiony szyld, buduje zaufanie zamiast olśniewać.
**Paleta:** dwa równorzędne tryby, jeden zmienny akcent per klient:
- jasny (Lidia): `#FFFFFF` tło · `#EFF8F7` surface sekcji · `#15211F` tekst · `#0F6F66` akcent (u Lidii turkus ze ściany salonu)
- ciemny (M.E.N.): `#0B0906` tło · `#232323` surface sekcji · `#F3EEE3` tekst · `#C79A4B` akcent (bursztyn)
- akcent ≤10% powierzchni (CTA, gwiazdki, aktywne stany), granice = ink na 12% krycia
**Fonty:** Playfair Display (display; w tych dwóch dostarczonych stronach — dla NOWEJ produkcji standardem jest Bodoni Moda, patrz DESIGN.md i warianty 00-A…00-E) / Work Sans (body). Fonty hostowane lokalnie (RODO).
**Layout:** jedna strona pionowa: sticky frosted-glass navbar z klikalnym telefonem → hero (display + kursywa na jednym słowie) → usługi/cennik jako płaskie `<dl>` z `divide-y` → galeria/zdjęcia klienta → opinie jako `<blockquote>` z gwiazdkami w akcencie → godziny + kontakt + mapa → stopka z polityką prywatności. Podstrony (galeria, o-nas) tylko gdy treści za dużo.
**Techniki:** warstwowanie tonalne bg/surface zamiast cieni (Flat-By-Default), przyciski-pigułki (pill), glass-panel na zdjęciowym tle (Lidia), sekcje ze zdjęciem lokalu pod overlay'em w akcencie, mapa Google z delikatnym filtrem pod motyw, `prefers-reduced-motion` wszędzie, mobile-first, min. 44px dotyk.
**Kiedy używać:** domyślnie dla KAŻDEGO płacącego klienta agencji — bezpieczny, konwersyjny, zgodny z systemem. Motyw jasny/ciemny wg konwencji niszy albo koloru fizycznego lokalu (patrz DESIGN.md).

---

## Styl 00-A — Default: wariant glass-hero (Egoist)
**Link:** lokalny: `portfolio/site-00a/` (po deployu portfolio: /site-00a/)
**Vibe:** Default w wydaniu miękkim i eleganckim — pełnoekranowe zdjęcie włosów pod szklanym panelem, głęboka śliwka zamiast krzyku.
**Paleta:** `#FFFFFF` tło · `#F6F0F3` surface (chłodny róż) · `#221C19` tekst · `#7E2C47` śliwka/burgund (akcent)
**Fonty:** Bodoni Moda (didone — reprezentant standardu produkcji) / Work Sans
**Layout:** hero = zdjęcie na cały ekran + wyśrodkowany glass-panel z CTA i oceną → cennik jako TRZY KARTY na surface (mini-dl w każdej) → galeria siatka 4 kwadratów (prawdziwe zdjęcia z salon-egoist.pl) → opinie: jedna duża kursywą + dwie mniejsze → kontakt dwukolumnowy z mapą.
**Techniki:** glass-panel (blur+saturate) jako scena hero, karty cennika zamiast jednej listy, mapa z lekkim sepiowym tintem.
**Kiedy używać:** salon damski/beauty z dobrym zdjęciem "bohaterem"; jakość i spokój od pierwszego ekranu.

## Styl 00-B — Default: wariant ciemny slab (Salon Brodaczy)
**Link:** lokalny: `portfolio/site-00b/` (po deployu portfolio: /site-00b/)
**Vibe:** Default w rejestrze barberskim — ciemno, gęsto, bez zdjęć; charakter niesie slab serif i poświaty rdzy.
**Paleta:** `#0C0A08` tło · `#1E1B18` surface · `#F2EDE6` tekst · `#C2703E` rdza/spalona sjena (JEDYNY ciepły akcent w rodzinie wariantów)
**Fonty:** Zilla Slab (slab serif, kursywa na "brodaczy") / Work Sans
**Layout:** hero czysto typograficzne (radialne poświaty akcentu w tle) → cennik dwukolumnowy Włosy|Broda → "Zasady domu" z numeracją kursywą + galeria dashed-placeholder (wzorzec DESIGN.md) → opinie siatka 3 → kontakt + mapa z invert-filtrem.
**Techniki:** radial-gradient glow na body, slab-kursywa jako podtytuły kolumn, mapa odwrócona pod ciemny motyw, dashed kafle jako uczciwy brak zdjęć.
**Kiedy używać:** barber/warsztat bez materiałów foto; ciemny motyw niszy wg DESIGN.md, mocny charakter bez jednego zdjęcia.

## Styl 00-C — Default: wariant cennik-od-progu (J.Ostrowski)
**Link:** lokalny: `portfolio/site-00c/` (po deployu portfolio: /site-00c/)
**Vibe:** Default postawiony na głowie — ciemna zieleń, geometryczny display i ceny jako pierwsza rzecz, którą widzisz; nawigacja zadokowana NA DOLE.
**Paleta:** `#0A0F0C` tło (ciemna butelka) · `#15201A` surface · `#EDF3EE` tekst · `#57B586` zieleń (akcent)
**Fonty:** Unbounded (geometryczny display — ceny i nazwy usług) / Work Sans
**Layout:** BEZ klasycznego hero i BEZ navbara u góry: mini-nagłówek z oceną → cennik natychmiast, wielkimi wierszami (nazwa w display + cena w akcencie) → opinie WPLECIONE między bloki cennika jako pełnoszerokie pasma na surface (raz z lewej, raz z prawej) → sekcja liczb (261 / 15:30 / 0 zł) → godziny + mapa → dokowany pasek na dole ekranu (nav + telefon-pigułka, frosted).
**Techniki:** odwrócona hierarchia (cennik jako hero), bottom dock bar zamiast headera, pasma-cytaty full-bleed (-mx), statystyki zamiast marketingu, mapa z zielonym invert-tintem.
**Kiedy używać:** firma "bez ściemy" z mocnym dowodem społecznym; klient chce, żeby cena i konkret pracowały od pierwszej sekundy.

## Styl 00-D — Default: wariant sticky-kolumna (KREATOR)
**Link:** lokalny: `portfolio/site-00d/` (po deployu portfolio: /site-00d/)
**Vibe:** Default jak wizytówka autorskiego studia — lewa kolumna stoi, treść płynie; indygo i humanistyczny serif dodają "autorskości".
**Paleta:** `#FFFFFF` tło · `#F1F2F8` surface (chłodny) · `#191B24` tekst · `#3A4A9F` indygo (akcent)
**Fonty:** Alegreya (humanistyczny serif o kaligraficznym rytmie, kursywne "a" w logotypie) / Work Sans
**Layout:** desktop: dwie kolumny — lewa STICKY (nazwa, nav, telefon-pigułka, ocena) + prawa przewijana (manifest-cytat → cennik na surface → opinie: duży cytat + dwa mniejsze → kontakt z mapą); mobile: klasyczny navbar-glass i pion.
**Techniki:** sticky aside h-screen z flex space-between, kursywna litera w logotypie jako sygnatura, punktory-kropki w akcencie.
**Kiedy używać:** jednoosobowe studio z marką osobistą właściciela; strona ma brzmieć jak rozmowa z konkretnym człowiekiem.

## Styl 00-E — Default: wariant dwugłos (KAROLINA)
**Link:** lokalny: `portfolio/site-00e/` (po deployu portfolio: /site-00e/)
**Vibe:** Default rozpisany na dwa równoległe głosy — kolumny Ona|On biegną przez CAŁĄ stronę, grotesk i teal robią nowoczesny, czysty ton.
**Paleta:** `#FFFFFF` tło · `#EEF6F4` surface (miętowy) · `#132220` tekst · `#0E6B67` głęboki teal (akcent)
**Fonty:** Bricolage Grotesque (grotesk display, gruby i charakterny) / Work Sans
**Layout:** nawigacja jako PŁYWAJĄCA PIGUŁKA na środku góry (nie pełny pasek) → krótkie centralne hero "Jeden salon. Dwa światy." → dalej DWIE RÓWNOLEGŁE KOLUMNY przez całą stronę (Ona | On), każda z własną kartą intro, cennikiem i cytatem, prawa przesunięta w dół (stagger) i rozdzielone pionową kreską → wspólna karta "Przychodzicie razem?" → kontakt + mapa.
**Techniki:** page-level split grid z translate-y stagger, gradientowa pionowa linia-separator, pill-nav z cieniem zamiast navbar-glass full-width, copy pisane parami ona/on.
**Kiedy używać:** salon damsko-męski/rodzinny z dwiema równorzędnymi ofertami; struktura strony sama tłumaczy model biznesu.

---

## Styl 01 — Ciemny neon
**Link:** https://fable5-portfolio.netlify.app/site-1/
**Vibe:** Nocny szyld barberski — klub, neon, miasto po zmroku.
**Paleta:** `#07060a` tło (prawie czarne) · `#ff2d95` neon róż (nagłówki, CTA) · `#19e3ff` neon cyjan (drugi głos, obwódki) · `#ffb347` bursztyn (gwiazdki)
**Fonty:** Monoton (neonowe napisy) / Barlow + Barlow Condensed
**Layout:** hero na pełny ekran z podwójnym neonowym logo i siatką podłogi w perspektywie, dalej klasyczny pion: cennik na tablicy, galeria 3×2, opinie w kartach z neonową górną krawędzią, kontakt w "tubach".
**Techniki:** text-shadow wielowarstwowy jako poświata neonu, animacja flickera szyldu (z reduced-motion), obwódki `tube` z inset glow, overlay różowo-cyjanowy na zdjęciach.
**Kiedy używać:** męski barbershop z charakterem, klient młodszy, lokal działający wieczorami; gdy firma chce wyglądać "miejsko" i odważnie.

## Styl 02 — Gazeta / print editorial
**Link:** https://fable5-portfolio.netlify.app/site-2/
**Vibe:** Strona jak lokalny dziennik — winieta, łamy i cennik w ogłoszeniach drobnych.
**Paleta:** `#f7f4ec` papier · `#191714` farba drukarska · `#b3001b` czerwień akcentowa (kicker, ceny) · biel kart `#ffffff`
**Fonty:** Playfair Display 900 (winieta, tytuły) / PT Serif (treść) + Oswald (nadtytuły, etykiety)
**Layout:** masthead na środku z podwójną linią, pasek "z ostatniej chwili", artykuł dwułamowy z inicjałem, cennik jako siatka ogłoszeń w ramkach, opinie jako "listy do redakcji", kontakt w ramce double.
**Techniki:** CSS columns z justowaniem i dzieleniem wyrazów, drop cap, dot-leadery, pull-quote z czerwoną linią, pływający przycisk "Zadzwoń" z twardym cieniem.
**Kiedy używać:** firma z historią/tradycją, starsza klientela, salon "od lat w tym samym miejscu"; też gdy klient ma dużo treści do opowiedzenia.

## Styl 03 — Industrial / warsztat
**Link:** https://fable5-portfolio.netlify.app/site-3/
**Vibe:** Zakład rzemieślniczy jak hala warsztatowa — tabliczki znamionowe, pasy ostrzegawcze, konkret.
**Paleta:** `#232528`/`#2e3134` stal i beton · `#f5b301` żółć bezpieczeństwa (akcent, CTA) · `#e8e6e1` jasny tekst · `#3a3e42` płyty metalowe
**Fonty:** Big Shoulders Display (stencilowe nagłówki) / IBM Plex Mono (całe body — techniczny rejestr)
**Layout:** hero dwukolumnowy (stencil + zdjęcie z nitami w rogach), cennik jako dwie kolumny "tabliczek" z nitami, galeria z żółtymi tagami rejestracyjnymi, opinie jako "protokół odbioru" w ramkach dashed.
**Techniki:** hazard stripes (repeating-linear-gradient), clip-path na przyciskach (ścięte rogi), nity z radial-gradient, twarde cienie 4px imitujące blachę, prefiksy `//` i `[ ]` w etykietach.
**Kiedy używać:** barber męski "bez ściemy", detailing samochodowy, każda nisza z warsztatowym charakterem.

## Styl 04 — Luksus / glamour
**Link:** https://fable5-portfolio.netlify.app/site-4/
**Vibe:** Butikowa elegancja — grafit, płynne złoto i cisza dobrego hotelu.
**Paleta:** `#101014` grafit · `#c9a35c`→`#e8cf9a` złoto (gradient animowany) · `#f1ece2` kość słoniowa (tekst) · `#16161c` panele
**Fonty:** Cormorant Garamond (display, kursywa jako kontrapunkt) / Jost 300 (body, szerokie trackingi)
**Layout:** hero pełnoekranowe ze zdjęciem pod ciemną winietą i centralnym logo, potem wąskie, wyśrodkowane sekcje: karta usług z dot-leaderami, galeria w złotych ramkach 3:4, wielki cytat-testimonial, kontakt w trzech kolumnach.
**Techniki:** animowany gradient "shine" na złotych napisach (background-clip: text), ornament ✦ z liniami po bokach, cienkie złote ramki 1px, letter-spacing 4-7px na etykietach.
**Kiedy używać:** salon premium, wyższe ceny, klient chce się odróżnić "klasą" — barber gentlemanski, salon beauty z ambicjami.

## Styl 05 — Brutalizm
**Link:** https://fable5-portfolio.netlify.app/site-5/
**Vibe:** Krzyk z ulicy — żółć/czerń, twarde ramki, zero owijania w bawełnę.
**Paleta:** `#ffe600` żółć (hero, akcenty) · `#0a0a0a` czerń · `#fffef5` złamana biel · brak innych kolorów
**Fonty:** Archivo Black (wszystkie nagłówki, uppercase) / Space Mono (body — monospace)
**Layout:** marquee na samej górze, hero na pełnej żółci z typografią 11rem (część liter tylko obrys), cennik jako surowa tabela HTML z twardymi ramkami, galeria placeholderów w kratę, opinie w kartach z podwójnym twardym cieniem, kontakt na czerni z dashed ramkami.
**Techniki:** -webkit-text-stroke na literach outline, box-shadow bez blur (8px 8px 0), przyciski "wciskające się" przy hoverze, chips/badges z grubą ramką, rotowane stample w placeholderach.
**Kiedy używać:** nowa firma bez zdjęć i historii, młody właściciel, komunikacja "prosto z mostu"; świetny gdy trzeba się wybić bez contentu.

## Styl 06 — Pastelowy feminine
**Link:** https://fable5-portfolio.netlify.app/site-6/
**Vibe:** Miękki, ciepły salon "dla niej" — róż, lawenda i łuki.
**Paleta:** `#fbe4ea` róż pudrowy · `#e6dcf5` lawenda · `#c96f8d` róż głęboki (CTA, akcent) · `#fffaf7` kremowa biel · `#4d3f4b` śliwkowy tekst
**Fonty:** Prata (nagłówki serif) + Great Vibes (script na "odręczne" wtrącenia) / Quicksand (body)
**Layout:** hero gradientowe z dwoma zdjęciami w łukach (arch), usługi w trzech pastelowych kartach z zaokrągleniem 26px, galeria z narożnikami wyciętymi w łuk, opinie w białych kartach z dużym cudzysłowem, kontakt w gradientowej "kapsule".
**Techniki:** border-radius 200px na górze zdjęć (arch), rozmyte plamy (blur 60px) w tle hero, script font jako "eyebrow" zamiast uppercase'owych kickerów, miękkie kolorowe cienie.
**Kiedy używać:** salon damski, beauty, stylizacja paznokci/brwi — wszędzie, gdzie klientka ma poczuć przytulność i kobiecość.

## Styl 07 — Vintage / wiktoriański
**Link:** https://fable5-portfolio.netlify.app/site-7/
**Vibe:** Zakład golibrody sprzed wieku — papier, ornamenty, rejestr usług z numeracją rzymską.
**Paleta:** `#f1e7d3` papier · `#2b2118` sepia-brąz (tekst, ramki) · `#8c5a2b` miedź (akcenty, ornamenty) · `#e7dabf` ciemniejszy papier paneli
**Fonty:** Rye (szyld) + Cinzel (nagłówki kapitalikowe) / EB Garamond (treść)
**Layout:** cała strona w podwójnej ramie (double border) jak afisz, masthead z ornamentami ❦✂, "rejestr usług" z numeracją I.–V. i dot-leaderami, manifest z inicjałem, opinie jako "depesze", kontakt jako bilet z nożyczkami po bokach.
**Techniki:** tło z drobną kropką (radial-gradient pattern), sepia na zdjęciach, ornamenty typograficzne zamiast ikon, ramki double + cienie offsetowe jak druk.
**Kiedy używać:** barbershop z "tradycyjnym" pozycjonowaniem (brzytwa, gorący ręcznik), lokal na starówce, klient 30+ ceniący rytuał.

## Styl 08 — Y2K chrome
**Link:** https://fable5-portfolio.netlify.app/site-8/
**Vibe:** Retro-futuryzm z 2000 roku — chrom, kosmos i przyciski jak z pierwszego iMaca.
**Paleta:** `#16102e`/`#241a4a` kosmiczny fiolet · chrom (gradient srebrny na tekstach) · `#ff3dbb` magenta + `#4ce0ff` cyjan (przyciski aqua) · `#b8ff2e` limonka (statusy)
**Fonty:** Orbitron (futurystyczny display) / Exo 2 (body)
**Layout:** hero z chromowanym logo i lewitującymi kulami 3D, cennik w metalicznym panelu, sekcja "hitów" jako płyty CD (conic-gradient z dziurą), opinie w okienkach systemowych z paskiem tytułu, kontakt w drugim panelu.
**Techniki:** chrome text (background-clip: text + drop-shadow), przyciski aqua z połyskiem (::after highlight), kule z radial-gradient + float animation, scanline'y na "hologramach".
**Kiedy używać:** klient z dystansem i humorem, salon celujący w młodych; też jako "wow" do demo pokazującego zakres możliwości.

## Styl 09 — Zen / japoński minimal
**Link:** https://fable5-portfolio.netlify.app/site-9/
**Vibe:** Cisza i powietrze — strona oddycha, nic nie krzyczy.
**Paleta:** `#fbfaf6` ciepła biel · `#262420` tusz · `#7d8471` matcha (akcent) · `#8b877e` szarość drugorzędna
**Fonty:** Shippori Mincho (serif display) / Karla 300 (body, duża interlinia 1.9)
**Layout:** wąska kolumna 880px, hero trzyelementowe (pionowy napis, nagłówek, enso z oceną), sekcje oddzielone samą linią 1px, cennik jako lista z górną/dolną kresą, jedno duże zdjęcie, jeden cytat na środku, kontakt w dwóch kolumnach dl.
**Techniki:** writing-mode: vertical-rl, enso (okrąg z przerwą przez border-left transparent + rotate), numeracja sekcji znakami 一二三四, hover linków wydłużający gap, ekstremalny whitespace.
**Kiedy używać:** kameralne studio jednoosobowe, klient premium ceniący spokój, masaż/wellness; gdy zdjęć jest mało a jakość ma mówić szeptem.

## Styl 10 — Kinetyczna typografia
**Link:** https://fable5-portfolio.netlify.app/site-10/
**Vibe:** Strona w ruchu — wielkie słowa wjeżdżają z boków, typografia JEST layoutem.
**Paleta:** `#121212` czerń · `#f4f1ea` złamana biel · `#ff4d00` acid orange (jedyny akcent) · litery outline jako trzeci walor
**Fonty:** Anton (wszystko duże, uppercase) / Familjen Grotesk (body)
**Layout:** hero = trzy linie po 11rem wjeżdżające naprzemiennie + kręcący się okrągły badge SVG, pasek marquee usług, cennik jako wielkie wiersze z hover-przesunięciem, "ściana słów" usług zamiast galerii + jedno zdjęcie, cytat-krzyk, finał z obróconym pomarańczowym "REZERWUJ".
**Techniki:** scroll-reveal na IntersectionObserver (klasy .rv/.slide-l/.slide-r z fallbackiem), animacje wjazdu cubic-bezier, textPath na okręgu SVG, mix-blend-mode: difference na headerze, outline text.
**Kiedy używać:** barber z mocną marką osobistą, klient chce energii i "internetowego" charakteru; dobre gdy brak zdjęć, bo typografia niesie całość.

## Styl 11 — Neo-Memphis
**Link:** https://fable5-portfolio.netlify.app/site-11/
**Vibe:** Kolorowa zabawa lat 80/90 — konfetti, grube obrysy i poczucie humoru.
**Paleta:** `#fff8ef` krem · `#241f2b` atrament (obrysy 3px) · `#ff6b6b` koral + `#23c9b6` morski + `#ffd166` słońce + `#9b5de5` winogrono
**Fonty:** Fredoka (zaokrąglony display) / Nunito (body)
**Layout:** hero z blobem za zdjęciem i podkreśleniem markerem, cennik jako trzy karty "Ona/On/Junior" w pastelowych tintach, galeria polaroidów z rotacją i tagami, opinie w dymkach komiksowych z ogonkami, kontakt w fioletowej karcie.
**Techniki:** wszystko z border 3px + twardy cień (6-8px 0), kształty konfetti fixed w tle (kropki/trójkąty/zygzaki), rotacje 1-2° na kafelkach, organiczny blob border-radius, humor w copy jako element stylu.
**Kiedy używać:** salon rodzinny/dziecięcy, młoda właścicielka z luzem, nisza gdzie uśmiech sprzedaje (np. strzyżenie dzieci).

## Styl 12 — Szwajcarski minimal
**Link:** https://fable5-portfolio.netlify.app/site-12/
**Vibe:** Czysta informacja — siatka, jeden akcent, zero dekoracji.
**Paleta:** `#ffffff` biel · `#111111` czerń · `#e30613` szwajcarska czerwień (kropka, strzałki, hover) · `#767676` szarość opisów
**Fonty:** Schibsted Grotesk (wszystko — jeden krój, gra wagami) / —
**Layout:** wszystkie sekcje w widocznej siatce z linii 1px (kolumna etykiety ze sticky nagłówkiem + kolumna treści), hero z gigantycznym nagłówkiem i "faktami" (ocena/opinie/miasto) w bocznej kolumnie, cennik z opisami pod nazwą, opinie jako lista.
**Techniki:** border jako jedyny środek wyrazu, czerwona kropka po nagłówkach (::after), strzałki → przed cenami, tabular-nums, ujemny letter-spacing na dużych stopniach.
**Kiedy używać:** klient chce "porządnie i nowocześnie" bez ozdób, usługi profesjonalne (dietetyk, korepetycje), świetny przy zerowej liczbie zdjęć.

## Styl 13 — Botaniczny / organiczny
**Link:** https://fable5-portfolio.netlify.app/site-13/
**Vibe:** Salon jak ogród — rysowane kwiaty kołyszą się na wietrze, wszystko rośnie spokojnie.
**Paleta:** `#fdfcf8` mleczna biel · `#6d7f5e` szałwia + `#40503a` głęboka zieleń · `#c26e51` terakota (kwiaty, gwiazdki) · `#2e332a` ciemnozielony tekst
**Fonty:** Lora (serif, kursywa na akcenty) / Karla 300 (body)
**Layout:** hero dwukolumnowe z ręcznie rysowanym bukietem SVG, cennik jako "łodygi" z listkiem-punktorem, filozofia z cytatem w organicznym blobie, opinie w kartach z asymetrycznym rogiem (liść), kontakt w ciemnozielonej "bramie ogrodu" z liśćmi w rogach.
**Techniki:** inline SVG ilustracje (kwiaty, liście) z animacją sway (rotate na transform-origin bottom), border-radius asymetryczny jako motyw liścia, blob-quote, brak fotografii zastąpiony ilustracją.
**Kiedy używać:** salon "naturalny" (koloryzacje ziołowe, eko-kosmetyki), wellness/masaż, klientka dbająca o zdrowie włosów; działa bez zdjęć.

## Styl 14 — 3D immersive
**Link:** https://fable5-portfolio.netlify.app/site-14/
**Vibe:** Wejście do cyfrowej strefy — scena 3D reaguje na kursor, słupek barberski kręci się jak hologram.
**Paleta:** `#0b0e14` void · `#7dd3fc` lodowy błękit (akcent, glow) · `#e5484d`+`#3d63dd` paski słupka barberskiego · `#131824` panele
**Fonty:** Chakra Petch (techniczny display) / Sora (body)
**Layout:** hero jako scena z perspektywą (podłoga-siatka rotateX, treść na translateZ), słupek barberski z animowanymi pasami po prawej, usługi jako 6 paneli odchylających się w 3D przy hoverze, opinie jako "hologramy" ze scanlinami, kontakt w doku.
**Techniki:** perspective + preserve-3d + parallax za kursorem (pointermove, wyłączany dla touch/reduced-motion), animowany barber pole (repeating-linear-gradient + background-position), glow shadows, clip-path na przyciskach.
**Kiedy używać:** młody męski salon, klient-gadżeciarz, demo "pokaż mi coś czego nikt nie ma"; wymaga desktopu żeby błysnąć w pełni.

## Styl 15 — Bauhaus
**Link:** https://fable5-portfolio.netlify.app/site-15/
**Vibe:** Forma podąża za fryzurą — kompozycja modularna, koło/kwadrat/trójkąt, kolory podstawowe.
**Paleta:** `#f4efe6` kość · `#1d1d1b` czerń (ramki 2px) · `#d94f2b` czerwień + `#2b5bd9` błękit + `#f2b705` żółć (system oznaczeń)
**Fonty:** Josefin Sans (geometryczny, wszystkie wagi) / —
**Layout:** hero jako siatka modularna 2×2 w ramach (tytuł / pole z kołem / zdjęcie / metryka z faktami), cennik jako 6 modułów z geometrycznym tagiem w rogu, opinie jako plakaty z kolorową belką, kontakt dwudzielny (czerwone pole + dane).
**Techniki:** ujemne marginesy na komórkach dla wspólnych ramek, conic-gradient w kole (ćwiartka), figury geometryczne jako punktory/ikony (zamiast ikonek), mix kolorów podstawowych w tłach modułów.
**Kiedy używać:** klient ceniący design i porządek, salon w nowoczesnym wnętrzu; uniwersalny miks minimalizmu z charakterem.

---

## Jak używać

- **Jeśli nie wskażę stylu, buduj w Stylu 00 (Default)** — to standard produkcji klienckiej zgodny z DESIGN.md.
- **Jeśli powiem np. "styl 07"**, użyj go jako punkt startowy: przejmij paletę, fonty, layout i techniki z karty (i z kodu `portfolio/site-7/`), ale treść, zdjęcia i wariant strony (Basic/Website+/Pro+) nadal wynikają z briefu klienta.
- Style można mieszać na wyraźne polecenie (np. "layout ze stylu 12, paleta ze stylu 04") — wtedy wymień w odpowiedzi, co skąd wziąłeś.
- Kod źródłowy stylów 01–15: `portfolio/site-N/index.html`. Lookbook z miniaturkami: https://fable5-portfolio.netlify.app
