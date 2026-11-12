# Krok po kroku: jak robimy stronę klienta

Instrukcja dla nas dwóch. Od leada do działającej strony i dalej. Każdy krok mówi, co wpisać
w Claude Code i po czym poznać, że jest skończony.

Zasada na całość: **jeden klient = jedna sesja**. Po skończeniu etapu wpisz `/clear`. Długa rozmowa
o trzech klientach naraz jest droższa i Claude zaczyna mylić dane.

---

## 0. Zanim zaczniesz (raz na komputer)

Node 22, Chrome, `npm install`, `npx wrangler login`. Szczegóły w `../README.md`.
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

Instrukcja jest w `../workers/opinie-licznik/README.md`. Liczby z Booksy i Facebooka zmieniamy ręcznie.

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

## Co podać Claude'owi, żeby dokończyć konfigurację

Stan na 12.11.2026 wieczorem. Licznik opinii, liczniki skanów kart i codzienna kontrola stron już działają.

### Wymaga Twojego kliknięcia (to Twoje konta)

**1. Klucz Google: ograniczenie i alert**
Klucz już działa w workerze. Zostało zabezpieczenie, bo był wklejony w rozmowie:
1. `https://console.cloud.google.com/apis/credentials` → kliknij klucz → „Ogranicz klucz" →
   zaznacz tylko **Places API (New)** → „Zapisz".
2. `https://console.cloud.google.com/billing` → „Budżety i alerty" → budżet 5 zł z powiadomieniem
   e-mail.

**2. Token GitHuba**
Zrobione 12.11.2026. Token wygasa 12.12.2026: po tej dacie `git push` przestanie działać i trzeba
wygenerować nowy na `github.com/settings/tokens` (zaznacz `repo` i `workflow`).

**3. Hasło SSH do serwera**
Było wklejone w rozmowie, więc zmień je. Claude loguje się kluczem i hasła nie potrzebuje.
Nic nie trzeba pisać.

**4. Konto w Uptime Kumie**
Otwórz `http://ADRES_SERWERA:3001` (z domu albo przez Tailscale), ustaw login i hasło, dodaj
domeny klientów i powiadomienia. Do tego momentu konto może założyć każdy w Twojej sieci.

**5. Nikodem**
Po `git pull` zniknie mu plik `.claude/settings.local.json`. Odtwarza go poleceniem
`cp .claude/settings.local.example.json .claude/settings.local.json` i wpisuje swoją ścieżkę.

### Co Claude może zrobić od razu, bez czekania na cokolwiek

| Zadanie | Co napisać |
|---|---|
| Skill do zdjęć (zmniejszanie, kadrowanie, WebP) | `zrób skill do zdjęć` |
| Dane strukturalne dla Grandy i Pudelka | `dodaj dane strukturalne Grandzie i Pudelkowi` |
| Lokalne fonty zamiast Google w Filiżance i szablonie fotografa | `przenieś fonty na lokalne` |
| Test całego procesu na jednym kliencie | `/new-client <nisza> <nazwa>` i dalej według kroków wyżej |

## Gotowe polecenia do wklejenia

Podmień nazwy i wklej. Im konkretniej, tym mniej poprawek.

**Nowy klient i brief**
```
/new-client kosmetyczki Studio Urody Anna
Wizytówka Google: [link]. Instagram: [link]. Booksy: [link].
Z rozmowy: pracuje sama, chce rezerwacji przez Booksy, nie chce cennika na stronie.
```

**Budowa**
```
Zbuduj stronę dla klienta studio-urody-anna według briefu. Styl 04 z design/STYLES.md.
Hero na pełny ekran ze zdjęciem photos/salon-wnetrze.jpg.
```

**Poprawki (jedna rzecz na wiadomość)**
```
U klienta studio-urody-anna: w nagłówku na telefonie przycisk „Umów wizytę" łamie się na dwie linie. Napraw tylko to.
```
```
W galerii zdjęcie photos/paznokcie-3.jpg ma uciętą dłoń. Popraw kadr, reszty nie ruszaj.
```
```
Pokaż 3 wersje kroju nagłówków jako zrzuty ekranu.
```
```
Zmień godziny otwarcia w sobotę na 9:00-14:00, na stronie i w danych dla Google.
```

**Publikacja i po niej**
```
/ship studio-urody-anna
```
```
Zrób lokalne SEO dla klienta studio-urody-anna. Listę dla klientki napisz tak, żebym mógł ją przesłać SMS-em.
```
```
Podepnij licznik opinii Google dla klienta studio-urody-anna.
```

**Sprzedaż**
```
/leads kosmetyczka Tomaszów Mazowiecki 20
```
```
Napisz ofertę na opinie dla klienta studio-urody-anna. Jestem z nią na Pani.
```
```
Przygotuj odpowiedzi na opinie dla klienta studio-urody-anna:
[wklej opinie z Google]
```

**Kontrola i porządki**
```
Sprawdź, czy wszystkie strony klientów działają.
```
```
Zacommituj zmiany klienta studio-urody-anna.
```

**Większe zadania**
```
/orchestrate Dodaj w webappie eksport listy klientów do CSV z filtrem po niszy.
```
Uwaga: `/orchestrate` opłaca się dopiero przy zadaniu z co najmniej trzema niezależnymi częściami.
Przy małej zmianie kilku agentów zużywa więcej niż jedna sesja.

**Czego nie pisać**
- „Popraw stronę", „zrób ładniej". Claude zgadnie co innego, niż masz na myśli.
- Dziesięciu uwag naraz. Trzy z nich wyjdą źle.
- „Dodaj coś fajnego". Skończy się karuzelą, której klient nie chciał.

## Dlaczego nie używamy narzędzi z rolek

Żadne z nich nie robi lepszej strony dla fryzjera, a każde kosztuje utrzymanie albo ryzyko.
Część łamie regulaminy (OmniRoute, Agent Reach na zalogowanych kontach), część jest pod duże
projekty programistyczne (Agent Skills, Superpowers, Graphify), część wymaga opieki nad serwerem
(Chatwoot, Umami). Z rolek wzięliśmy dwa pomysły, które nic nie kosztują: routing modeli
i orkiestrację. Pełna lista z powodami: `PRZYDATNE-REPO.md`.
