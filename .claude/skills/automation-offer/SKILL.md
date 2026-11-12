---
name: automation-offer
description: Dobiera klientowi automatyzację z katalogu agencji i pisze krótką ofertę w ludzkim tonie. Użyj przy prośbach typu „co jeszcze możemy sprzedać klientowi X", „napisz ofertę na opinie", „upsell", „oferta automatyzacji", „klient pyta, czy da się…", oraz gdy klient skarży się na mało opinii w Google, nieodebrane telefony albo klientów zapominających o wizytach.
---

# Oferta automatyzacji dla klienta

Sprzedajemy tak samo jak strony: po ludzku, jedną prostą rzecz, z ceną podaną od razu.

## Krok 1: sprawdź, co w ogóle wolno oferować

Przeczytaj `templates/automations/README.md`. Oferujesz **wyłącznie** produkty ze stanem „gotowy"
albo „gotowy do pilotażu". Produktów „w planach" nie obiecujesz, nawet „wkrótce".

Cena pochodzi z kolumny „Cena" w tym pliku. Jeśli jest tam „DO USTALENIA", zapytaj użytkownika
o kwotę i nie wstawiaj własnej.

## Krok 2: sprawdź, czy to pasuje do tego klienta

Przeczytaj jego `brief.md` i stronę. Dla „Opinii Google":

| Sytuacja klienta | Wniosek |
|---|---|
| Mało opinii albo dawno żadnej nowej | dobry kandydat, to główny argument |
| Dużo opinii, ale bez odpowiedzi właściciela | dobry kandydat, argumentem są odpowiedzi |
| Dużo świeżych opinii i właściciel odpowiada | słaby kandydat, powiedz to użytkownikowi wprost |
| Nie ma wizytówki Google albo nie ma do niej dostępu | najpierw wizytówka (skill `local-seo`) |
| Daje rabaty za opinie | najpierw musi z tym skończyć, powiedz dlaczego |
| Branża medyczna | zgłoś użytkownikowi, nie proponuj automatycznie |

Jeśli produkt nie pasuje, napisz to. Oferta wciśnięta na siłę psuje relację, na której stoi abonament.

## Krok 3: napisz ofertę

Dwie wersje, obie gotowe do wysłania:

**Krótka (SMS, Messenger, WhatsApp), do 5 zdań:**
1. konkretna obserwacja o jego firmie (prawdziwa liczba z wizytówki, nie ogólnik),
2. co proponujemy, jednym zdaniem, słowami klienta,
3. co on musi zrobić (prawie nic),
4. cena,
5. pytanie zamykające bez nacisku.

**Do rozmowy (telefon albo na miejscu):** te same punkty jako 4-5 haseł, plus 2-3 prawdopodobne
obiekcje z odpowiedzią.

## Zasady tonu i treści

- Per Pani/Pan, chyba że użytkownik jest z klientem po imieniu.
- Zero żargonu: nie „automatyzacja", „AI", „system reputacji", „konwersja". Zamiast tego „kod przy
  kasie", „odpowiadamy na opinie", „raz w tygodniu wyślę do akceptacji".
- **Niczego nie obiecujemy liczbowo:** ani liczby opinii, ani pozycji w Google, ani nowych klientów.
- Liczby o kliencie muszą być prawdziwe i sprawdzone dziś. Nie znasz liczby, nie podawaj jej.
- Nie atakujemy tego, co klient ma teraz. Pozycjonujemy jako dodatek.
- Cena od razu, bez „to zależy" i bez pakietów.
- Przy obiekcjach nie przekonujemy na siłę. Dopytujemy, co jest prawdziwym powodem.
- Mówimy wprost o zasadach Google: prosimy wszystkich, nic w zamian. Klient, który chce „tylko
  dobre opinie", musi usłyszeć, że tak nie robimy i dlaczego.

## Wynik

Dwie wersje oferty, jedno zdanie oceny dopasowania i lista tego, co trzeba od klienta zebrać po
jego „tak" (z `wymagania.md` danego produktu). Nie wysyłasz niczego sam.
