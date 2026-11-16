# GTA VI Clipper: plan wykonania

> Plan do briefu [06_GTA_CLIPPER_BRIEF.md](06_GTA_CLIPPER_BRIEF.md). Spisany 15.11.2026 (niedziela), premiera w czwartek 19.11.2026.
> Stan kampanii i limitów API sprawdzony 15.11.2026; kampanie zmieniają się codziennie.

---

## 1. Co się zmieniło względem briefu (po sprawdzeniu)

| Założenie z briefu | Stan faktyczny | Skutek dla planu |
|---|---|---|
| Maszyna z RTX 3090 24 GB | Ten PC ma **RTX 3060 12 GB**. Brak Dockera, Ollamy, streamlinka, yt-dlp. Są: Python 3.11, ffmpeg 9, faster-whisper, torch+CUDA | Trzeba wybrać maszynę (pytanie A). Na 12 GB mieści się Whisper large-v3-turbo + model 7–8B, nie 14B |
| „Whop Content Rewards” | To teraz osobna firma **Content Rewards** (contentrewards.com). Whop robi tylko wypłaty i weryfikację tożsamości | Konto zakładamy na contentrewards.com, wypłata przez Whop (Polska obsługiwana, min. 10 USD) |
| Będą kampanie streamerów GTA VI | **Na 15.11 nie ma żadnej kampanii dużego streamera ani Rockstara pod premierę GTA VI.** Są dwie małe związane z GTA (niżej) | Codzienny skan kampanii to osobne zadanie. System musi być gotowy na kampanię, która pojawi się w dniu premiery |
| YouTube: ~6 uploadów dziennie | Od 1.06.2026 osobny limit: **100 uploadów dziennie**. Od 2.11.2026 uploady z niezweryfikowanych projektów nie są już wymuszane jako prywatne | YouTube Shorts automatyzujemy w pełni |
| TikTok przez API jako draft | Aplikacja bez audytu publikuje tylko prywatnie, a wytyczne TikToka wprost odrzucają narzędzia wewnętrzne i przenoszenie treści z innych platform | **TikTok publikujemy ręcznie z telefonu.** System dostarcza plik i gotowy opis |
| Stawka z kampanii = zarobek | Typowo 0,80–2 USD za 1000 wyświetleń, ale realnie dużo mniej: pule płacą efektywnie 0,06–0,13 USD za 1000, najlepszy clipper w kampanii Lysium zarobił 107 USD | Traktować tydzień premiery jako test, nie pewny zarobek |
| `ranking-yt-short`, LocalAgent z ntfy | **Nie ma ich na tym dysku** | Akceptację przez ntfy piszemy od nowa (proste). Uploader YT też |
| Repo „replica” i REA w Pobranych | Jest tylko REA. „Replica” to 11 skilli już w tym repo | Patrz sekcja 8 |

### Zasady Content Rewards, które system musi wymuszać
- Link zgłasza się **do 30 minut od publikacji**. Jeden post tylko do jednej kampanii.
- Jedno konto Content Rewards na osobę. Instagram musi być kontem Professional/Creator.
- **Oznaczenie reklamy na początku wideo** (wymóg regulaminu).
- Wiele kampanii wymaga co najmniej 50% widzów z USA/Kanady/UK/Australii/NZ. Konto z polską widownią ich nie spełni, więc potrzebne są **nowe, anglojęzyczne konta**.
- Właściciel akceptuje każdy klip ręcznie i może odrzucić mimo wyświetleń. Kupowanie wyświetleń to trwały ban.

### Ryzyko prawne, którego brief nie rozstrzyga
Zasady Rockstara pozwalają na materiały „niekomercyjne”. Płatne klipowanie pod to nie podpada, więc jest szarą strefą. Zmniejszamy ryzyko tak: tylko kampanie, w których streamer lub marka daje zgodę, tylko krótkie highlighty, zero leaków i cutscenek. To decyzja właścicieli projektu, nie da się jej wyeliminować kodem.

---

## 2. Decyzje

Podjęte 15.11.2026:

- **Maszyna:** wszystko na tym PC (RTX 3060 12 GB). Skutek: Whisper large-v3-turbo + model `qwen2.5:7b`, transkrypcja i LLM kolejno, start na 3–5 kanałach na żywo w 720p.
- **Kod:** folder `gta-clipper/` w repo agencji (przeniesiony 15.11 na prośbę): `C:\Users\Nikodem\Desktop\website business\gta-clipper`.
- **Renderer:** własny (ffmpeg + faster-whisper) jako ścieżka główna, OpenShorts jako próba z limitem 2 godzin.
- **Instalacje i budowa:** zgoda. Publikacje, zgłoszenia do kampanii i commity nadal tylko po pytaniu.

Nadal otwarte:

- **Platformy na start.** Rekomendacja: YouTube Shorts (automat) + TikTok (ręcznie z telefonu). Reels dopiero po premierze.
- **Konta.** Nowe anglojęzyczne konta TikTok i YouTube pod klipy. Zakłada je człowiek.

Pozostałe pytania z briefu rozstrzygam tak: stały layout per streamer (bez Gemini), streamerzy anglojęzyczni, sukces mierzymy liczbą zaakceptowanych klipów, wyświetleniami i kwotą rozliczoną w kampaniach. Format TOP 5 zostaje jako osobny etap po premierze.

---

## 3. Architektura

Jeden pakiet Pythona, jedna baza SQLite, wspólny pipeline dla trybu VOD i live. Różni się tylko źródło czatu i wideo.

```
gta-clipper/
  clipper/
    sources/vod.py        pobranie VOD + czatu (yt-dlp, chat-downloader lub TwitchDownloaderCLI)
    sources/live.py       streamlink + ffmpeg, bufor kroczący w segmentach, samoczyszczący
    chat/irc.py           czat Twitcha na żywo (anonimowe połączenie IRC)
    detect/spikes.py      okna 10 s, z-score do średniej kroczącej, wagi słów, filtr subów/raidów, łączenie, cooldown
    detect/signals.py     klipy widzów z Twitch Helix, głośność audio
    cut.py                wycinek 60–90 s z pre-rollem per streamer
    render/               transkrypcja, wybór fragmentu, kadr 9:16, napisy, oznaczenie reklamy
    brain.py              Ollama: ocena, tytuł, opis, hashtagi
    campaigns.py          profile kampanii (YAML): długość, tagi, platformy, stawka, cap, wymagania
    approve.py            ntfy: podgląd + przyciski OK / odrzuć
    publish/youtube.py    upload przez YouTube Data API
    publish/manual.py     paczka na telefon dla TikToka + przypomnienie o zgłoszeniu linku (30 min)
    tracker.py            SQLite: klip, konto, kampania, link, wyświetlenia, status, zarobek
    cli.py                `clipper vod <url>`, `clipper live`, `clipper status`
  config/streamers.yaml   kanał, pre-roll, współrzędne kamerki, jakość bufora
  config/campaigns/*.yaml
  tests/
```

### Render: najważniejsza zmiana względem briefu
Brief chce OpenShorts jako klipera. Na tym PC wymaga to Docker Desktop + WSL2 + GPU w kontenerze, czego nikt tu jeszcze nie uruchomił, a do premiery są 4 dni.

**Rekomendacja:** najpierw własny, mały renderer (ffmpeg + faster-whisper + napisy ASS, wszystko już zainstalowane), bo przy stałym layoucie per streamer to kilkaset linii i działa od pierwszego dnia. OpenShorts próbujemy równolegle z limitem czasu 2 godziny. Jeśli ruszy z GPU, podmieniamy go za moduł `render/` przez jego REST API; jeśli nie, nic nie tracimy.

### Co przenosimy z istniejącej automatyzacji
Źródło: `C:\Users\Nikodem\Desktop\tiktok\@GiggityShorts12\automatyzacja\yt_automation1.3\yt_automation\`

- `extract_captions.py`: Whisper ze znacznikami słów, prawie bez zmian (podmiana na faster-whisper).
- `generate.py`: styl napisów słowo po słowie, układ 9:16 z rozmytym tłem, wykrywanie NVENC, `normalize_audio`, rysowanie tekstu z obrysem i cieniem.
- Helper `ask_ollama` i wzorzec tabel SQLite (historia, użycie) jako podstawa trackera.
- Fonty i dźwięki z tego folderu.

Nie przenosimy: renderowania klatka po klatce w moviepy (za wolne, napisy wypalamy przez ffmpeg), sztywnego szablonu rankingu, stałej nazwy pliku wyjściowego, cichego łykania błędów.

---

## 4. Harmonogram

### Niedziela 15.11: fundament i tryb VOD
1. Instalacja: yt-dlp, streamlink, Ollama + model (qwen2.5:7b na 12 GB, 14b na 24 GB), `chat-downloader`, ntfy (publiczny serwer, losowy temat).
2. Szkielet repo, konfiguracja, logowanie, baza.
3. Detektor spike'ów + testy jednostkowe na zapisanym czacie.
4. Tryb VOD: pobranie starego VOD-a GTA RP z czatem, lista kandydatów, wycinki.
5. Równolegle: próba OpenShorts (limit 2 h).

### Poniedziałek 16.11: render i akceptacja
1. Renderer 9:16 ze stałym layoutem, napisami i oznaczeniem reklamy.
2. Mózg: ocena kandydata, tytuł, opis.
3. Akceptacja przez ntfy z podglądem.
4. Pierwszy pełny przebieg VOD → klip na telefonie. Strojenie progów na 2–3 VOD-ach.

### Wtorek 17.11: publikacja i tryb live
1. Upload na YouTube (wymaga projektu Google Cloud i OAuth od Was).
2. Paczka ręczna dla TikToka i licznik 30 minut na zgłoszenie linku.
3. Profile kampanii, tracker.
4. Tryb live: bufor kroczący + czat IRC na 1 kanale, potem 3.

### Środa 18.11: próba generalna
1. Live przez kilka godzin na 3–5 kanałach (dowolna gra), pomiar łącza, dysku, VRAM.
2. Przegląd kodu, poprawki, instrukcja uruchomienia.
3. Skan kampanii, profile dla tych, do których dołączyliście, współrzędne kamerek streamerów z listy.

### Czwartek 19.11: premiera
Live na wybranych kanałach, człowiek akceptuje każdy klip. Skan kampanii dwa razy dziennie. VOD jako fallback.

### Po premierze
Reels, głośność audio jako trzeci sygnał, format TOP 5 dnia, strojenie progów na danych z akceptacji.

---

## 5. Kampanie do rozważenia (stan 15.11.2026)

Wszystkie na contentrewards.com.

| Kampania | Stawka | Pasuje? |
|---|---|---|
| GTA 6 „Tokyo Girl” (Placements) | 0,70 USD/1k, 2–35 USD za klip, budżet 2 tys. prawie nietknięty | Tak: wymaga wizualiów GTA + promowanej piosenki. Niski cap |
| Lysium / Benji Ramos (GTA RP) | 1,50 USD/1k, max 150 USD, 462 z 1000 USD wykorzystane | Tak: klipy ze streama. Wymaga próbki wideo. Dobry poligon przed premierą |
| CoD Warzone S1, CoD MW4 DMZ | do 2 USD/1k, cap do 1000 USD | Inna gra, ale ten sam pipeline; materiał dostarcza kampania |
| Split-Screen UGC [English] | 3 USD/1k (YouTube 1,50), max 500 USD | Do sprawdzenia: zasady widoczne dopiero po dołączeniu |
| Pule streamerów (Lacy, CORE, JShock) | pula, progi rzędu 1 mln wyświetleń | Słabo: efektywnie grosze za 1000 |

Do obserwowania pod premierę: contentrewards.com/c/discover, lista Clyper (clyper.io/clipping-programs), Discord Reach Clipping. Sieć gta6clipping.com miała 11.11 zero opłaconych kampanii.

Zasada: kampania, która każe płacić za wejście, to scam.

---

## 6. Podział pracy na agentów (oszczędność tokenów)

Główna sesja tylko koordynuje i scala. Każdy moduł ma wąski kontrakt (wejście, wyjście, testy), więc agent nie musi znać reszty.

| Agent | Zadanie | Kiedy |
|---|---|---|
| builder 1 | `detect/` + `chat/` + testy | niedziela, równolegle |
| builder 2 | `sources/vod.py`, `cut.py` | niedziela, równolegle |
| builder 3 | `render/` z przeniesieniem kodu z v1.3 | niedziela–poniedziałek |
| builder 4 | próba OpenShorts z limitem czasu | niedziela |
| builder 5 | `approve.py`, `publish/`, `tracker.py` | poniedziałek–wtorek |
| builder 6 | `sources/live.py` | wtorek |
| researcher | skan kampanii, zapis do `config/campaigns/` | codziennie, w czwartek 2 razy |
| reviewer | przegląd całości przed próbą generalną | środa |

Agenty z `.claude/agents/` tego repo (`builder`, `researcher`, `reviewer`) pasują do tego podziału.

---

## 7. Co musi zrobić człowiek

Tego nie da się ani nie należy automatyzować:

1. Konto Content Rewards + weryfikacja tożsamości w Whop (osoba pełnoletnia, jedno konto na osobę).
2. Nowe konta TikTok i YouTube, podpięcie ich do Content Rewards.
3. Projekt w Google Cloud z YouTube Data API i plik OAuth.
4. Aplikacja na dev.twitch.tv (Client ID i Secret) do klipów widzów.
5. Aplikacja ntfy na telefonie i subskrypcja tematu.
6. Dołączanie do kampanii i zgłaszanie linków (system przypomina i podaje gotowy link).
7. Akceptacja każdego klipu.

Sekrety trafiają do `.env` poza repozytorium.

---

## 8. Skille i narzędzia

- **REA (reverse-engineer-anything): nie używamy.** Analizuje binaria i ruch sieciowy, nie wideo. Wymaga nowszego Node niż zainstalowany. Jedyne zastosowanie (podglądanie ruchu Whop/TikTok) łamałoby regulaminy i zasadę z briefu.
- **Replica:** z całego zestawu przydają się dwa skrypty: `replica-diff/imgdiff.py` (porównanie naszego kadru z klatką wzorcowego klipu) i `replica-design/contrast.py` (kontrast napisów). Reszta dotyczy klonowania aplikacji.
- **code-review** przed próbą generalną. **schedule** lub **loop** do codziennego skanu kampanii.
- Higgsfield (publikacja na TikToku) pomijamy: to płatna usługa, sprzeczna z zasadą „bez abonamentów”.

---

## 9. Uprawnienia potrzebne do pracy autonomicznej

- Zapis w nowym folderze projektu i odczyt folderu `Desktop\tiktok`.
- Instalacje: `winget` (yt-dlp, streamlink, Ollama, ewentualnie Docker Desktop), `pip install` w wirtualnym środowisku projektu, `ollama pull`.
- Uruchamianie: `python`, `ffmpeg`, `yt-dlp`, `streamlink`, `ollama`, `docker` (tylko przy próbie OpenShorts).
- Sieć: pobieranie VOD-ów i czatu z Twitcha, wysyłka powiadomień ntfy.

Bez pytania nie robię: publikacji czegokolwiek na kontach, zgłoszeń do kampanii, commitów i pushy.

---

## 10. Weryfikacja

1. **Detektor:** testy jednostkowe na zapisanym czacie; na prawdziwym VOD-zie porównanie kandydatów z klipami widzów z Twitcha (ile najpopularniejszych klipów detektor trafia).
2. **Render:** klip 1080x1920, napisy zsynchronizowane, oznaczenie reklamy widoczne, czas renderu zmierzony.
3. **Pełny przebieg VOD:** `clipper vod <url>` kończy się powiadomieniem z podglądem na telefonie.
4. **Publikacja:** jeden upload testowy na YouTube jako niepubliczny, wpis w trackerze.
5. **Live:** 3 godziny na 3 kanałach bez wzrostu zajętości dysku ponad limit bufora, klip na telefonie w kilka minut od spike'a.
6. **Zasady kampanii:** klip niezgodny z profilem (za długi, bez tagu) jest blokowany przed akceptacją.
