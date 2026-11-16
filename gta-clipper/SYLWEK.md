# Kliper GTA na Twoim PC (Sylwek)

Ten sam kliper, który działa u Nikodema, postawiony na Twoim komputerze z RTX 3090. Ty klipujesz **Lacy'ego** (pula 30 tys. USD na Content Rewards), Nikodem klipuje **Lysium**. Nie klipujemy tych samych streamerów, bo nasze klipy tego samego momentu konkurowałyby ze sobą i mogłyby zostać odrzucone jako duplikaty.

Całość zajmuje ok. godzinę, z czego większość to pobieranie (model językowy ok. 9 GB, Whisper ok. 1,5 GB).

> **Najszybciej z Claude Code:** otwórz folder repo w VS Code z Claude Code i napisz:
> „Przeczytaj gta-clipper/SYLWEK.md i przeprowadź mnie przez instalację krok po kroku. Rzeczy, które musi zrobić człowiek (konta, logowania), pokaż mi po kolei.”

---

## 1. Rzeczy, które musisz założyć sam (zrób najpierw, część czeka na weryfikację)

1. **Content Rewards:** konto na contentrewards.com i weryfikacja tożsamości w Whop (dowód + selfie, wypłaty na konto lub PayPal, minimum 10 USD). Jedno konto na osobę, więc **własne**, nie Nikodema.
2. **Konta pod Lacy'ego:** nowe konta TikTok i YouTube (najlepiej też Instagram) z nazwą związaną z Lacy'm, np. `LacyClips`, `LacyDaily`, `LacyMoments`; zdjęcie profilowe z grafiki kampanii. Tak zaleca sam organizator (Reach), bo konto z innej niszy może zostać odrzucone.
3. **Podłącz te konta w Content Rewards** (ustawienia konta) i dołącz do kampanii **Lacy $30,000 Pool** (Reach Clipping). Zasady są w `gta-clipper/kampanie/lacy/` i w `gta-clipper/config/campaigns/lacy-pool.yaml`.
4. **Aplikacja ntfy** na telefonie (do akceptowania klipów).

Bez VPN-a. Wszystko po angielsku: język aplikacji, profil, opisy.

## 2. Instalacja na PC

1. Sklonuj repo (albo zrób `git pull`, jeśli już je masz) i wejdź do folderu `gta-clipper`.
2. W PowerShellu w folderze `gta-clipper` uruchom raz:
   ```
   powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1
   ```
   Skrypt instaluje Pythona 3.11, ffmpeg, yt-dlp i Ollamę, tworzy środowisko `.venv`, doinstalowuje biblioteki CUDA dla Whispera, pobiera model `qwen2.5:14b` (pasuje do 24 GB) i odpala testy. Można go uruchamiać wielokrotnie. Na końcu tworzy `run_clipper.cmd`: **tym plikiem uruchamiasz kliper** (dodaje biblioteki CUDA do ścieżki).
3. Na koniec testy powinny pokazać same `passed` (jeden `skipped` jest normalny).

## 3. Plik `.env` (ustawienia, nigdy nie trafia do gita)

Skrypt kopiuje `.env.example` do `.env`. Uzupełnij w nim:

| Pole | Co wpisać |
|---|---|
| `CLIPPER_DATA_DIR` | folder na nagrania i klipy, np. `C:/gta-clipper-data` (potrzeba kilkudziesięciu GB) |
| `OLLAMA_MODEL` | `qwen2.5:14b` |
| `NTFY_TOPIC` | **własny** losowy temat, np. `gtaclip-sylwek-` + kilkanaście losowych znaków. Inny niż Nikodema, żeby się nie mieszało |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | możesz dostać od Nikodema prywatnie (nie przez repo ani czat grupowy) albo założyć własne na dev.twitch.tv |
| `YOUTUBE_CLIENT_SECRETS` | zostaw `secrets/youtube_client_secret.json` |

W aplikacji ntfy zasubskrybuj dwa tematy: swój `NTFY_TOPIC` oraz ten sam z końcówką `-reply`.

## 4. YouTube: logowanie (raz)

1. console.cloud.google.com → nowy projekt → **APIs & Services → Library** → włącz **YouTube Data API v3**.
2. **Google Auth Platform → Branding/Audience**: typ **External**, nazwa aplikacji i Twój e-mail. W **Audience → Test users** dopisz e-mail konta Google, na którym jest kanał z Lacy'm.
3. **Credentials → Create credentials → OAuth client ID → Desktop app**. Opcji „AI-powered agent” **nie zaznaczaj**. Pobierz JSON i zapisz jako `gta-clipper\secrets\youtube_client_secret.json` (folder `secrets` utwórz sam).
4. Uruchom `run_clipper.cmd auth`. Otworzy się przeglądarka: wybierz konto kanału, zaznacz oba pola zgody, Continue. Komenda wypisze nazwę kanału.

Logowanie w trybie testowym wygasa po 7 dniach; wtedy powtórz `run_clipper.cmd auth`.

Jeśli pracujesz na PC zdalnie z innego komputera (tunel VS Code), po zgodzie Chrome pokaże błąd `localhost:8765/?state=…&code=…`. Skopiuj cały ten adres i w terminalu na PC wpisz `curl "<adres>"`. Kod jest ważny kilka minut.

## 5. Streamerzy na Twoim PC

W `config/streamers.yaml` są profile wszystkich streamerów. Ty uruchamiasz kliper tylko z kanałami ekipy Lacy'ego (nie z `lysium`):

```
run_clipper.cmd live lacy
```

Kampania Lacy'ego jest już wpisana w jego profilu (`campaign: lacy-pool`): kliper sam dodaje „Lacy” i `#Lacy` w opisie oraz `#ad` na początku klipu. Na premierze GTA VI (czw. 19.11) kamerka może być w innym miejscu niż zwykle; wtedy daj znać Claude'owi, to ustawi kadr z klatki streama.

## 6. Jak wygląda praca

1. `run_clipper.cmd live lacy` nagrywa stream, słucha czatu i sprawdza klipy widzów. Przy ciekawym momencie robi pionowy klip z napisami i wysyła podgląd na telefon.
2. Na telefonie klikasz **OK** albo **Odrzuć**. Po OK dostajesz powiadomienie z gotowym opisem do wklejenia.
3. Wrzucasz klip na TikTok ręcznie z telefonu (plik jest w `data/to_post/<numer>/`), a na YouTube komendą `run_clipper.cmd publish <numer> --public`.
4. Po wrzuceniu na TikTok: `run_clipper.cmd posted <numer> tiktok <link>`. **Link zgłaszasz do kampanii w Content Rewards w ciągu 30 minut**; kliper przypomina.
5. `run_clipper.cmd status` pokazuje podsumowanie.

Zasada: 3–5 najlepszych klipów dziennie na konto, nie więcej. Pula Lacy'ego płaci dopiero po zebraniu łącznie 1 mln zaakceptowanych wyświetleń i wymaga, żeby co najmniej połowa widzów była z USA, Kanady, UK, Australii lub NZ.

Pełny opis komend: `README.md`. Plan i research: `../docs/07_GTA_CLIPPER_PLAN.md`.
