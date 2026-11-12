# Opinie Google: sprawdzenie po wdrożeniu

Zaznacz każdy punkt. Niesprawdzony punkt zapisz jako niesprawdzony, a nie jako zaliczony.

## Przed publikacją (lokalnie)

- [ ] W `opinia/index.html` nie został żaden znacznik WIELKIMI LITERAMI
      (`grep -nE "[A-Z]{4,}_[A-Z_]+|NAZWA FIRMY" opinia/index.html` nic nie zwraca).
- [ ] Żaden przycisk nie ma pustego linku ani `href="#"`.
- [ ] Kolory i kroje pisma są takie jak na stronie głównej klienta.
- [ ] Zrzuty ekranu mobile i desktop (`node scripts/screenshot.mjs <folder> opinia/index.html`):
      żaden przycisk nie łamie się na dwie linie, logo nie jest rozciągnięte.
- [ ] Kontrast tekstu na przycisku głównym co najmniej 4,5:1.
- [ ] Na stronie nie ma pytania o zadowolenie ani gwiazdek przed linkiem do Google.

## Po publikacji

- [ ] `node scripts/check-sites.mjs DOMENA` bez błędów.
- [ ] `https://DOMENA/opinia/` otwiera się na telefonie w sieci komórkowej.
- [ ] Przycisk główny otwiera okno wystawiania opinii właściwej firmy (sprawdź nazwę i adres).
- [ ] Pozostałe przyciski prowadzą tam, gdzie mają. Telefon otwiera wybieranie numeru.

## Kod QR

- [ ] Kod wygenerowany dla adresu `https://DOMENA/opinia/` (z `https` i ukośnikiem na końcu).
- [ ] Zeskanowany z ekranu telefonem z iOS i telefonem z Androidem.
- [ ] Zeskanowany z **wydruku** w docelowym rozmiarze, z odległości wyciągniętej ręki.

## Po pierwszym tygodniu

- [ ] Właściciel dostał raport i szkice odpowiedzi, odpowiedział.
- [ ] Odpowiedzi są opublikowane w wizytówce.
- [ ] W briefie klienta jest data startu i liczba opinii w dniu startu (punkt odniesienia).
