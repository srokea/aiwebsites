# gta-clipper

Lokalny kliper streamów: skoki aktywności czatu → pionowe klipy 9:16 z napisami → akceptacja na telefonie (ntfy) → publikacja i rozliczenie kampanii. Wszystko działa na tym komputerze, bez płatnych usług.

Plan i ustalenia z researchu: `../docs/07_GTA_CLIPPER_PLAN.md`.

## Uruchamianie

Wszystkie komendy z folderu projektu:

```
.venv\Scripts\python.exe -m clipper.cli <komenda>
```

| Komenda | Co robi |
|---|---|
| `vod <url> --dry-run` | Pobiera czat nagrania i wypisuje wykryte momenty, nic nie renderuje |
| `vod <url> --top 5` | Robi klipy z 5 najsilniejszych momentów i wysyła je na telefon |
| `live kanal1 kanal2` | Klipowanie na żywo (bez argumentów: kanały z `config/streamers.yaml`). Sam uruchamia w tle strażnika (jak `watch`); `--no-watch` to wyłącza |
| `watch` | Strażnik w pierwszym planie do Ctrl+C: co 20 s pobiera decyzje z telefonu i dla zatwierdzonego klipu wysyła powiadomienie (folder, opis, komenda `posted`); co 5 min przypomina o niezgłoszonych linkach do kampanii (`--interval`, `--remind-every`) |
| `decisions` | Jednorazowo pobiera decyzje OK / Odrzuć z telefonu; zatwierdzone klipy trafiają do `data/to_post/<id>/` (przy działającym `watch` zbędne) |
| `publish <id>` | Wrzuca zatwierdzony klip na YouTube jako **prywatny**; `--public` publikuje |
| `posted <id> tiktok <url>` | Zapisuje post wrzucony ręcznie i przypomina o zgłoszeniu linku do kampanii |
| `submitted <url>` | Oznacza link jako zgłoszony do kampanii |
| `remind --notify` | Pokazuje posty z niezgłoszonym linkiem (termin: 30 minut od publikacji) |
| `status` | Liczniki: kandydaci, klipy wg statusu, odsetek akceptacji, wyświetlenia, zarobek |

Przydatne opcje `vod`: `--z 3` (próg skoku, domyślnie 3; niżej = więcej kandydatów), `--compare` (ile klipów widzów z Twitcha trafia detektor), `--no-send` (nie wysyłaj na telefon), `--force` (renderuj ponownie).

## Konfiguracja

- `.env` (wzór w `.env.example`): katalog danych, model Ollamy, Whisper, temat ntfy, klucze Twitcha, plik OAuth YouTube. Nie trafia do gita.
- `config/streamers.yaml`: profil per streamer: pre-roll, współrzędne kamerki (stały kadr), język, kampania.
- `config/campaigns/*.yaml`: zasady kampanii (długość, tagi, platformy, stawka). Wzór: `_template.yaml`. Klip niezgodny z profilem dostaje status `blocked` i nie idzie na telefon. Profil może też wypalać stały napis (`overlay_text`, np. `twitch.tv/lysium`), wymagać słowa w opisie (`caption_must_mention`), draftu przed publikacją (`drafts_preapproval`) i linku w bio (`bio_link`); `status: skip` blokuje kampanię, która do nas nie pasuje (np. `marlon-diamonds`).

### ntfy na telefonie
W aplikacji ntfy zasubskrybuj dwa tematy: ten z `NTFY_TOPIC` oraz ten sam z końcówką `-reply`. Przyciski OK / Odrzuć pod powiadomieniem zapisują decyzję. Można też odpisać ręcznie w temacie `-reply`: `ok 12` albo `no 12 nudne`.

Publiczny serwer ntfy.sh przyjmuje załączniki do ok. 1–2 MB, więc na telefon idzie pomniejszony podgląd (360x640). Pełny klip leży w `data/clips/`.

### YouTube
Google Cloud Console → włącz YouTube Data API v3 → klient OAuth typu „Desktop app” → pobierz JSON do `secrets/youtube_client_secret.json`. Aplikacja jest w trybie testowym, więc konto kanału musi być dopisane w **Audience → Test users**, a logowanie wygasa po 7 dniach.

Logowanie: `clipper auth` (pokazuje nazwę kanału na końcu; zalogowany kanał: GTA 6 Plug, 16.11.2026). Kliper czeka na odpowiedź Google na porcie 8765.
- Przy pracy bezpośrednio na PC przeglądarka otwiera się sama i wszystko dzieje się automatycznie.
- Przy pracy z Maca przez tunel VS Code: otwórz link z wyjścia komendy w przeglądarce na Macu, zgódź się, a gdy Chrome pokaże błąd `localhost:8765/?state=…&code=…`, skopiuj cały ten adres i wyślij go na PC: `curl "<adres>"` w terminalu na PC. Kod jest ważny kilka minut.

## Jak to działa

1. **Źródło**: `sources/vod.py` (czat i wycinek nagrania przez yt-dlp) albo `sources/live.py` (streamlink + ffmpeg, bufor kroczący 15 minut, czat przez IRC).
2. **Detektor** `detect/spikes.py`: okna 10 s, skok względem średniej z ostatnich 5 minut, wagi dla słów typu LMAO/KEKW/OMG, pomijanie subów, raidów i botów, łączenie bliskich skoków.
3. **Wycinek** `cut.py`: ok. 75 s wokół momentu, z pre-rollem (czat reaguje po fakcie).
4. **Render** `render/`: Whisper (napisy słowo po słowie), wybór 15–45 s, kadr 9:16 (kamerka u góry + gra albo gra na rozmytym tle), oznaczenie reklamy, NVENC.
5. **Opis** `brain.py`: lokalny model w Ollamie daje tytuł, opis, hashtagi i ocenę 0–10. Ocena poniżej 4 odrzuca klip automatycznie.
6. **Akceptacja** `approve.py`, **publikacja** `publish/`, **rozliczenia** `tracker.py` (SQLite w `data/clipper.db`).

Jedna karta 12 GB: Whisper i model językowy pracują po kolei, nie naraz.

## Zmierzone na tym komputerze (RTX 3060 12 GB)

- VOD: pobranie 75 s wycinka ok. 30 s, transkrypcja 2–5 s, render ok. 8 s, opis z modelu ok. 9 s. Razem ok. 50 s na klip.
- Live: jeden kanał w 720p to ok. 3,4 Mb/s łącza i ok. 380 MB bufora.

## Znane ograniczenia

- Pobieranie czatu z nagrań idzie stronami po ok. 60 wiadomości, więc bardzo gęsty czat (ponad 60 wiadomości na sekundę) pobierze się wolno i z brakami. Tryb live tego nie dotyczy.
- W czacie z nagrań suby i raidy nie są oznaczane jako systemowe; w trybie live są.
- TikTok i Instagram wrzuca się ręcznie z telefonu (API TikToka nie dopuszcza takich narzędzi).
- Wycinek z bufora live może zaczynać się do ok. 2 s wcześniej (cięcie na klatce kluczowej).

## Drugi komputer (np. Sylwek)

1. Skopiuj folder projektu na drugi komputer (Windows, np. RTX 3090 24 GB) i w tym folderze uruchom raz: `powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1` (opcja `-OllamaModel` zmienia model, domyślnie `qwen2.5:14b`). Skrypt instaluje Pythona 3.11, ffmpeg, yt-dlp i Ollamę (winget), tworzy `.venv`, doinstalowuje biblioteki CUDA 12 dla Whispera (`nvidia-cublas-cu12`, `nvidia-cudnn-cu12`; cały torch nie jest potrzebny), pobiera model Ollamy i odpala testy. Można go uruchamiać wielokrotnie. Na tej karcie uruchamiaj clippera przez `run_clipper.cmd` (dodaje DLL-ki CUDA do PATH).
2. `.env` skopiuje się z `.env.example`, jeśli go nie ma (`.env.example` jest w repo dzięki wyjątkowi w `.gitignore`). Instrukcja krok po kroku: `SYLWEK.md`.
3. W `.env` uzupełnij: własny `NTFY_TOPIC` (inny niż na pierwszym komputerze, żeby powiadomienia się nie mieszały), klucze aplikacji Twitch można użyć te same, własny klient OAuth YouTube (`YOUTUBE_CLIENT_SECRETS`) i `clipper auth`.
4. Każda osoba ma własne konto Content Rewards/Whop (jedno na osobę) i własne konta w mediach społecznościowych. Nie dzielimy kont.
5. Podziel streamerów między komputery i nie klipuj tego samego streamera na obu. Dwa klipy tego samego momentu konkurują ze sobą i grożą odrzuceniem jako powtórka (repost/duplikat).

## Testy

```
.venv\Scripts\python.exe -m pytest -q
```
