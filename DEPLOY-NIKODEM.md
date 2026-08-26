# Jak zaktualizować, zredeployować i cofnąć appkę (Cold Call Tracker)

## Zwykła aktualizacja (za każdym razem)

Piszesz kod lokalnie (np. z Claude Code), robisz `git push` na GitHub. Potem na serwerze:

```bash
ssh <user>@192.168.0.113
cd /DATA/AppData/aiwebsites-repo
./redeploy.sh
```

To wszystko. Skrypt sam:
1. Zabezpiecza kopię aktualnie działającej wersji (do rollbacku).
2. Ściąga najnowszy kod (`git pull`).
3. Buduje appkę na nowo. **Jeśli build się wywali (błąd w kodzie) — skrypt kończy się
   tutaj i stara wersja dalej działa, nic się nie psuje.**
4. Restartuje kontener na nowej wersji.
5. **Sam sprawdza przez ~10 sekund, czy appka faktycznie wstała i odpowiada** (HTTP
   200/302). Jeśli nie (np. kontener wpadł w restart loop, brakuje jakiegoś pliku) —
   **automatycznie cofa się do poprzedniej działającej wersji, bez pytania.** Kod w
   repo zostaje na tej zepsutej wersji (trzeba go osobno naprawić/cofnąć), ale strona
   dla użytkowników nie pada.

Baza danych (`webapp/data/`) jest w `.gitignore` na poziomie całego repo — `git pull`
ani `git reset` nigdy jej nie tknie (to był problem 2026-08-20, stąd to twarde
zabezpieczenie).

Jeśli skrypt nie ma prawa wykonania:
```bash
chmod +x redeploy.sh rollback.sh
```

## Ręczny rollback

Jeśli appka DZIAŁA (odpowiada na HTTP), ale coś jest nie tak funkcjonalnie (np. zniknęła
jakaś strona/funkcja, ale sama appka się nie wywala) — automatyczny health-check tego nie
złapie, bo tylko sprawdza czy appka w ogóle odpowiada. W takiej sytuacji:

```bash
./rollback.sh      # cofa 1 wersje wstecz (ostatni redeploy)
./rollback.sh 2    # cofa 2 wersje wstecz
```

Bez gita, bez przebudowy, w kilka sekund. Baza danych się nie rusza.

## Co jeśli appka mimo wszystko nie wstaje

```bash
docker logs callcenter --tail 50
```
pokaże ostatnie błędy.

## Ktoś usunął/zepsuł coś w kodzie na stałe — jak to cofnąć w gicie

`rollback.sh` i auto-rollback w `redeploy.sh` cofają tylko **działający kontener** — kod
w repo zostaje zepsuty, dopóki ktoś go nie naprawi. Żeby naprawić sam kod:

**1. Znajdź, w którym commicie coś zniknęło:**
```bash
git log --oneline --diff-filter=D -- webapp/
```
Pokaże tylko commity, w których coś było kasowane w folderze appki. Dla konkretnego
pliku/folderu: `git log --oneline --all -- webapp/sciezka/do/rzeczy`.

**2a. Cały commit był zły (chcesz cofnąć wszystko, co w nim zmienił):**
```bash
git revert <hash-zlego-commita>
git push
```
`git revert` **nie kasuje historii** — dodaje nowy commit, który robi dokładnie
odwrotność złego. Bezpieczne przy pracy we dwóch, nie trzeba nic force-pushować ani
uzgadniać z drugą osobą.

**2b. Tylko konkretny plik/folder trzeba przywrócić (reszta commita była OK):**
```bash
git checkout <hash-zlego-commita>~1 -- webapp/sciezka/do/rzeczy
git commit -m "przywracam usuniete: sciezka/do/rzeczy"
git push
```
`~1` oznacza "stan tuż przed tym commitem".

**3. Wdróż poprawkę tak jak zwykle:**
```bash
ssh <user>@192.168.0.113
cd /DATA/AppData/aiwebsites-repo
./redeploy.sh
```
