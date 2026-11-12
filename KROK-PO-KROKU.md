# Krok po kroku: jak robimy stronę klienta

Instrukcja dla nas dwóch. Od leada do działającej strony i dalej. Każdy krok mówi, co wpisać
w Claude Code i po czym poznać, że jest skończony.

Zasada na całość: **jeden klient = jedna sesja**. Po skończeniu etapu wpisz `/clear`. Długa rozmowa
o trzech klientach naraz jest droższa i Claude zaczyna mylić dane.

---

## 0. Zanim zaczniesz (raz na komputer)

Node 22, Chrome, `npm install`, `npx wrangler login`. Szczegóły w `README.md`.
Sprawdzenie: `node scripts/check-sites.mjs` wypisuje listę stron klientów.

## 1. Lead

```
/leads barber Bełchatów 20
```

Dostajesz plik CSV w `leads/<nisza>/` z oceną każdej firmy. Najlepsze leady to ocena 4: aktywna
firma z opiniami i social mediami, ale bez własnej strony. Dzwonisz według schematu z webappa.

Model: nie ma znaczenia, leady zbiera agent na najtańszym modelu.

## 2. Folder i brief

```
/new-client fryzjerzy Nazwa Firmy
```

Claude zakłada folder z szablonu i zbiera dane z wizytówki Google, Facebooka, Instagrama i Booksy.
Wklej mu wszystko, co masz: zrzuty, linki, notatki z rozmowy.

**To najważniejszy krok.** Prawie każda runda poprawek bierze się z dziury w briefie, a nie ze
złego projektu. Zanim pójdziesz dalej, w `brief.md` musi być:

- wariant strony (Basic, Website+ albo Pro+) i odpowiedź, czy klient ma Booksy,
- ile osób pracuje (od tego zależy „pracuję" czy „pracujemy"),
- telefon, adres i godziny zgodne z wizytówką Google,
- skąd bierzemy kolory (logo, szyld, zdjęcia), a nie „ładny zielony",
- lista „do potwierdzenia z klientem".

Skończone, gdy: brief nie ma pustych pól poza tymi z listy „do potwierdzenia".

## 3. Zdjęcia

Wrzuć prawdziwe zdjęcia klienta do `photos/`. Bez nich strona wygląda jak szablon i nie da się
dobrze dobrać układu.

- Nazwy plików bez spacji i nawiasów (`hero-salon.jpg`, nie `IMG 2031 (1).jpg`).
- Zdjęcia cudzych stron, które się podobają, idą do `inspo/`. To, czego unikać, do `anty-inspo/`.
- Logo jako plik, a nie zdjęcie szyldu. Jeśli jest tylko zdjęcie, napisz to Claude'owi, odrysuje.

## 4. Budowa

Tu przełącz na najlepszy model (`/model`), bo to jest nasz produkt.

```
Zbuduj stronę dla klienta nazwa-firmy według briefu.
```

Claude sam: wybiera układ pod zdjęcia, buduje, robi zrzuty ekranu na telefon i komputer, przepuszcza
przez audyt Impeccable i poprawia. Minimum dwie rundy, zanim Ci pokaże.

Co sprawdzasz sam na zrzutach z `screenshots/<klient>/`, **najpierw na telefonie**:

1. Czy w trzy sekundy widać, co to za firma, gdzie jest i jak zadzwonić.
2. Czy twarze i fryzury na zdjęciach nie są ucięte.
3. Czy żaden przycisk nie łamie się na dwie linijki.
4. Czy teksty brzmią jak właściciel, a nie jak agencja reklamowa.
5. Czy nic nie jest zmyślone: ceny, opinie, godziny.

## 5. Poprawki

Przełącz na `/model sonnet`. Poprawki to większość pracy i tu oszczędza się najwięcej.

- **Jedna rzecz na wiadomość, konkretnie.** „Przesuń telefon w nagłówku w lewo", a nie „popraw
  nagłówek".
- **Chcesz wybrać wariant?** Napisz „pokaż 3 wersje fontu nagłówków jako zrzuty". Dostaniesz obrazy
  w `warianty/`, nie listę nazw.
- **Claude zmienił coś, o co nie prosiłeś?** Powiedz mu to od razu. Jeśli zdarza się to drugi raz
  w tej samej sprawie, poproś, żeby zaproponował poprawkę do skilla.

## 6. Opinie Google na stronie

Jeśli strona pokazuje ocenę i liczbę opinii z Google, niech aktualizuje się sama:

```
Podepnij licznik opinii dla klienta nazwa-firmy.
```

Instrukcja jest w `workers/opinie-licznik/README.md`. Liczby z Booksy i Facebooka zmieniamy ręcznie.

## 7. Publikacja

```
/ship nazwa-firmy
```

Claude robi zrzuty, puszcza reviewera, przechodzi listę kontrolną i uruchamia stronę lokalnie, żeby
sprawdzić, czy na świat nie wyjdzie `brief.md` ani inne pliki robocze. Potem **zatrzymuje się
i pyta o zgodę**. Po Twoim „tak" wdraża i sprawdza stronę na żywo.

Nigdy nie wgrywaj folderu klienta ręcznie przez panel Cloudflare. Tak wyciekły briefy trzech klientów.

Po publikacji sam, na telefonie w sieci komórkowej: kliknij telefon, mapę, Booksy, galerię.
Wklej link w Messengera i zobacz podgląd.

## 8. Po publikacji

```
Zrób lokalne SEO dla klienta nazwa-firmy.
```

Dostajesz trzy listy: co poprawione na stronie, co klient ma zrobić w swojej wizytówce Google
(gotowe do przesłania), co my robimy poza repo (Search Console).

Potem commit: „zacommituj zmiany klienta nazwa-firmy".

## 9. Dosprzedaż

```
Napisz ofertę na opinie dla klienta nazwa-firmy.
```

Jeśli się zgodzi: „wdróż opinie u klienta nazwa-firmy". Co tydzień wklejasz nowe opinie i piszesz
„przygotuj odpowiedzi dla klienta nazwa-firmy".

---

## Który model do czego

| Robota | Model |
|---|---|
| Projekt nowej strony | najlepszy dostępny (Fable albo Opus) |
| Poprawki, teksty, drobne zmiany | Sonnet |
| Webapp, skrypty, workery | Sonnet; trudne rzeczy sam odda agentowi `planner` |
| Leady, szukanie | idzie samo na Haiku |

## Pięć rzeczy, które najczęściej psują stronę

1. **Budowa bez zdjęć.** Placeholdery dają układ pod nic. Poczekaj na zdjęcia.
2. **Brief „z głowy".** Zły numer telefonu na stronie klienta kosztuje więcej niż godzina na brief.
3. **Dokładanie bajerów.** Karuzele, animacje, sekcje „na zapas". Klient końcowy chce zobaczyć
   cennik, zdjęcia i numer.
4. **Oglądanie tylko na komputerze.** Klienci naszych klientów siedzą na telefonach.
5. **Poprawki hurtem.** Dziesięć uwag w jednej wiadomości kończy się tym, że trzy są zrobione źle.

## Dlaczego nie używamy narzędzi z rolek

Krótko: żadne z nich nie robi lepszej strony dla fryzjera. Robią inne rzeczy, a każde kosztuje
utrzymanie albo ryzyko.

| Narzędzie | Dlaczego nie |
|---|---|
| OmniRoute | Obchodzi limity dostawców i podszywa się pod ich aplikacje. Grozi blokadą konta, a kod i dane klientów szłyby przez przypadkowe darmowe serwery. |
| Agent Reach | Scrapuje LinkedIna, Instagrama i X na Twoim zalogowanym koncie. To łamie ich regulaminy, a nasze leady i tak są w Google Maps. |
| Ponytail | Każe modelowi pisać mniej kodu. My już to mamy w zasadach, a na stronach liczy się dopracowanie, nie długość kodu. Niezależny pomiar oszczędności: ok. 8%. |
| Agent Skills, Superpowers | Dziesiątki skilli pod duże projekty programistyczne. Każdy skill to tekst doliczany do każdej sesji. Nasze skille są pisane pod nasz proces. |
| Graphify | Mapa dużego kodu. Strona klienta to kilka plików, nie ma czego mapować. |
| Cal.diy | Autorzy sami piszą, że nie nadaje się do użytku produkcyjnego. Klienci mają Booksy. |
| Chatwoot, Open SEO, Umami, Uptime Kuma | Dobre, ale każde wymaga własnego serwera i opieki. Wrócimy, gdy będzie konkretna potrzeba. |
| AppFlowy, OpenProject | Zamienniki Notion i Asany. Notion nam działa. |
| Open Generative AI, VoiceStudio | Generowanie wideo i głosu. Nie sprzedajemy tego. |
| terminal-mac | Wydane kilka dni przed sprawdzeniem, bez podpisu Apple. Do oglądania stron wystarcza Chrome. |
| n8n | Licencja nie pozwala trzymać danych klientów na naszej instancji bez płatnej wersji. Automatyzacje stawiamy na Cloudflare. |

Z pomysłów z rolek wzięliśmy dwie rzeczy, bo nic nie kosztują: **routing modeli** (drogi model
planuje, tani wykonuje) i **orkiestrację** (`/orchestrate`, tylko do dużych zadań).

Pełna tabela z licencjami: `README.md`.
