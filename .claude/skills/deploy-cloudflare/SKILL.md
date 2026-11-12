---
name: deploy-cloudflare
description: Wdraża stronę klienta na Cloudflare (Workers ze statycznymi plikami) i podpina domenę. Użyj przy prośbach typu „wrzuć stronę", „opublikuj", „deploy", „podepnij domenę", „strona nie działa po wdrożeniu", oraz zawsze przed uruchomieniem `wrangler deploy` w folderze klienta. Zawiera listę kontrolną przed publikacją i testy po niej.
---

# Wdrożenie strony klienta na Cloudflare

Publikacja jest widoczna dla klienta i jego klientów. **Samo `wrangler deploy`, zmianę DNS
i `wrangler secret` uruchamiasz dopiero po wyraźnym „tak" od użytkownika w tej rozmowie.**
Wszystko przed tym (lista kontrolna, testy lokalne) robisz bez pytania.

## Który sposób hostingu

| Typ projektu | Jak poznać | Jak wdrażać |
|---|---|---|
| Zwykła strona (domyślnie) | `wrangler.jsonc` z `"assets"` w folderze klienta | ten skill |
| Portfolio fotografa z panelem | `wrangler.toml`, `worker/`, `schema.sql` | `clients/fotografowie/portfolio-template/README.md` i `PLAYBOOK.md` |
| Strona z własnym backendem | `functions/`, `build.sh` | instrukcja w folderze tego klienta (np. `supabase/SETUP.md`) |

Nowa strona bez pliku konfiguracyjnego: skopiuj `wrangler.jsonc`, `.assetsignore`, `.gitignore`
i `_headers` z `templates/client/`.

**Nigdy nie wgrywaj folderu klienta przez panel Cloudflare ani bez `.assetsignore`.** Tak trafiły
do sieci pliki `brief.md` trzech klientów (wykryte w listopadzie 2026). Jeśli `name`
w `wrangler.jsonc` to `WPISZ_NAZWE_WORKERA_Z_PANELU`, zapytaj użytkownika o dokładną nazwę
istniejącego Workera i nie wymyślaj jej.

## Wymagania

- Node.js i zalogowany wrangler: `npx wrangler whoami` ma pokazać konto agencji. Jeśli nie pokazuje,
  użytkownik sam uruchamia `npx wrangler login` (otwiera przeglądarkę).
- Domena dodana jako strefa na koncie Cloudflare agencji. Bez tego `custom_domain` nie zadziała.

## Lista kontrolna przed publikacją

Przejdź wszystkie punkty i pokaż użytkownikowi wynik, zanim poprosisz o zgodę na deploy.

1. **`wrangler.jsonc`:** `name` to slug klienta (małe litery, myślniki), `routes` mają domenę
   i wersję z `www`, żadne `SLUG_KLIENTA` ani `DOMENA_KLIENTA` nie zostało ze wzoru. Klient bez
   domeny: usuń blok `routes`, strona wyjdzie pod `*.workers.dev`.
2. **`.assetsignore`:** wszystko, czego tu nie ma, staje się publiczne. Wypisz zawartość folderu
   (`ls -A`) i sprawdź każdy plik i katalog spoza strony: `brief.md`, notatki, `inspo/`,
   `anty-inspo/`, `warianty/`, oryginały zdjęć, PDF-y z materiałami klienta. Wzór ignoruje `*.md`.
3. **Sekrety:** w folderze nie ma haseł, kluczy ani `.dev.vars`. Sprawdź:
   `grep -rIlE "sb_secret_|service_role|SECRET|PASSWORD|api[_-]?key" . --exclude-dir=.wrangler`
4. **Adresy w treści:** `robots.txt`, `sitemap.xml`, `og:url`, `og:image` i `url` w JSON-LD
   wskazują docelową domenę, nie `DOMENA_KLIENTA` i nie adres roboczy.
5. **Waga:** `du -sh photos` i największe pliki. Zdjęcie powyżej ok. 500 KB na stronie-wizytówce
   to znak, że nie zostało zmniejszone. Pojedynczy plik powyżej 25 MB nie przejdzie w ogóle.
6. **Jakość:** nowa strona przeszła zrzuty ekranu (`node scripts/screenshot.mjs <folder>`)
   i subagenta `reviewer`. Przy drobnej poprawce wystarczy zrzut zmienionego miejsca.
7. **Podgląd lokalny, czyli dokładnie to, co wyjdzie na świat:** z folderu klienta uruchom
   w tle `npx wrangler dev --port 8787`, a potem z katalogu głównego
   `node scripts/check-sites.mjs http://localhost:8787`. Błąd „PUBLICZNY plik roboczy" oznacza
   dziurę w `.assetsignore`. Na koniec zatrzymaj podgląd.
8. **Próba na sucho:** `npx wrangler deploy --dry-run` z folderu klienta. Sprawdza konfigurację
   i pakowanie, niczego nie publikuje. Nie pokazuje, które pliki będą publiczne, od tego jest
   punkt 7.

## Domena

Domeny kupujemy w OVH, a DNS trzymamy w Cloudflare.

1. Użytkownik dodaje domenę w panelu Cloudflare (Add a domain). Cloudflare podaje parę serwerów nazw.
2. `node scripts/ovh.mjs ns <domena>` przestawia serwery nazw w OVH na Cloudflare. Domyślna para
   jest wpisana w skrypcie. Jeśli Cloudflare podał inną, przekaż ją jako argumenty.
   To zmiana na żywo, więc uruchamiasz ją po zgodzie użytkownika.
3. Propagacja trwa od kilku minut do doby. `routes` z `custom_domain: true` same tworzą rekordy DNS
   i certyfikat przy wdrożeniu.

## Publikacja

```
cd clients/<nisza>/active/<klient>
npx wrangler deploy
```

## Testy po publikacji

Uruchom i pokaż wyniki. Bez tego wdrożenie nie jest skończone.

```
node scripts/check-sites.mjs <domena>
```

Skrypt sprawdza, czy strona i wersja `www` odpowiadają, czy `brief.md` i `wrangler.jsonc` nie są
publiczne, czy działają `robots.txt` i `sitemap.xml` oraz czy są nagłówki bezpieczeństwa.

Do tego ręcznie:
- otwórz stronę na telefonie: telefon klikalny, mapa się ładuje, galeria otwiera zdjęcia,
- wklej link w komunikator i sprawdź podgląd (obrazek i tytuł),
- nowa domena: dodaj ją w Google Search Console (patrz skill `local-seo`).

## Gdy coś pójdzie źle

- **Cofnięcie:** `npx wrangler rollback` przywraca poprzednią wersję. `npx wrangler deployments list`
  pokazuje historię. Też wymaga zgody użytkownika.
- **404 na domenie zaraz po wdrożeniu:** DNS się jeszcze propaguje albo domena nie jest strefą
  na tym koncie Cloudflare.
- **Stara wersja w przeglądarce:** twarde odświeżenie. Domyślnie pliki mają `max-age=0`, więc to
  rzadko jest cache po stronie Cloudflare.
- **Opublikował się plik roboczy:** dopisz go do `.assetsignore` i wdróż ponownie. Jeśli zawierał
  dane wrażliwe, powiedz o tym użytkownikowi wprost.

## Czego nie robić

- Nie wdrażaj z katalogu głównego repo. Zawsze z folderu konkretnego klienta.
- Nie wpisuj sekretów do `wrangler.jsonc` ani `[vars]`. Sekrety idą przez `wrangler secret put`.
- Nie zmieniaj `name` w istniejącym `wrangler.jsonc`. Powstałby drugi worker, a domena została
  przy starym.
