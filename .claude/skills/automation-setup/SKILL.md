---
name: automation-setup
description: Wdraża u klienta automatyzację z katalogu agencji według jej szablonu w templates/automations/. Użyj, gdy klient zgodził się na produkt i trzeba go uruchomić, przy prośbach typu „wdróż opinie u klienta X", „zrób stronę /opinia", „wygeneruj kod QR", „uruchom automatyzację". Do samej oferty służy skill automation-offer, a do cotygodniowych odpowiedzi skill review-replies.
---

# Wdrożenie automatyzacji u klienta

Każdy produkt ma w `templates/automations/<produkt>/` komplet: `README.md` (kroki), `wymagania.md`
(co zebrać), `teksty.md` (gotowe komunikaty), `test-plan.md` (sprawdzenie), `rodo.md`.
Ten skill prowadzi przez nie w stałej kolejności.

## Kolejność

1. **Sprawdź stan produktu** w `templates/automations/README.md`. Produktu „w planach" nie wdrażasz.
   Jeśli użytkownik o niego prosi, zaproponuj rozpisanie go agentem `planner`.
2. **Zbierz wymagania.** Przeczytaj `wymagania.md` i brief klienta. O brakujące rzeczy zapytaj
   użytkownika jednym razem. Nie zaczynaj z placeholderami w miejscu linków. Uzupełnioną sekcję
   dopisz do `brief.md` klienta.
3. **Przeczytaj `rodo.md`.** Jeśli produkt wysyła wiadomości albo przechowuje dane, a nie ma umowy
   powierzenia, zatrzymaj się i powiedz to użytkownikowi.
4. **Wdróż według `README.md` produktu.** Pliki trafiają do folderu klienta, nigdy do `templates/`.
5. **Wygląd bierzesz ze strony klienta.** Wszystko, co zobaczy jego klient, ma jego kolory, kroje
   pisma i logo. Obowiązują zasady ze skilla `web-design`: mobile-first, per Pani/Pan, ikony marek
   z `design/SNIPPETS.md`, żadnych pustych linków.
6. **Przejdź `test-plan.md` punkt po punkcie** i pokaż wynik. Punkt, którego nie dało się sprawdzić
   (np. skan z wydruku), oddajesz użytkownikowi jako jego zadanie.
7. **Publikacja** przez skill `deploy-cloudflare`, po zgodzie użytkownika.
8. **Przekazanie:** wiadomość do klienta z `teksty.md`, dopasowana do niego, gotowa do wysłania.
   Wysyła ją użytkownik.

## Opinie Google: skrót

Najpierw zapytaj, który wariant strony: karta w naszym systemie (`mmates.pl/r/<slug>`, zakładana
w panelu webappa `/reviews.html`, bez wdrożenia) czy `/opinia/` na domenie klienta. Dla karty
pomijasz kopiowanie i zrzuty, generujesz tylko kod QR do jej adresu.

```
cp templates/automations/opinie-google/hub/index.html clients/<nisza>/active/<klient>/opinia/index.html
# podmień znaczniki, kolory i kroje pisma ze strony klienta
node scripts/screenshot.mjs clients/<nisza>/active/<klient> opinia/index.html
# po publikacji:
node scripts/qr.mjs https://<domena>/opinia/ clients/<nisza>/active/<klient>/qr-opinia.svg
```

Uwaga na `.assetsignore` klienta: plik `qr-opinia.svg` i materiały do druku nie muszą być publiczne.
Dopisz je tam.

## Czego nie robić

- Nie dodawaj na stronie `/opinia/` pytania o zadowolenie, gwiazdek do kliknięcia ani formularza
  „napisz do nas zamiast do Google". To odsiewanie opinii, zakazane przez Google.
- Nie dopisuj funkcji, których nie ma w szablonie produktu. Pomysł na ulepszenie zgłoś użytkownikowi.
- Nie zmieniaj szablonu w `templates/` przy okazji wdrożenia. Jeśli szablon ma błąd, popraw go
  osobno i powiedz o tym.
