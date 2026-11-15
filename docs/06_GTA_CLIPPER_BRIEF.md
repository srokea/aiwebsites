# GTA VI Clipper: opis projektu (brief dla agenta planującego)

> To jest **opis projektu, nie plan**. Na jego podstawie agent (Fable 5.2) ma napisać plan wykonania i zacząć działać. Rzeczy oznaczone **[zweryfikować]** to moja wiedza bez świeżego potwierdzenia, więc sprawdź je przed oparciem na nich decyzji.
> Autor pomysłu: Sylwester. Opis spisany 15.11.2026.

---

## 1. Idea w jednym akapicie

GTA VI ma premierę **w czwartek 19 listopada 2026** (PS5 / Xbox Series X|S). W tygodniu premiery największe streamy będą lecieć po kilka-kilkanaście godzin dziennie, ale ludzie oglądają głównie **krótkie klipy** (TikTok, Reels, YT Shorts). Projekt to lokalny, w pełni automatyczny system, który obserwuje kilka do kilkunastu streamów GTA VI, sam wyłapuje viralowe momenty (głównie po **eksplozjach aktywności czatu**), tnie je na pionowe klipy 9:16 z napisami, tytułem i hookiem, wysyła mi je do akceptacji na telefon i publikuje. Zarabiamy głównie przez **clipping campaigns** (płatność za wyświetlenia), a dodatkowo na własnych kanałach.

Twardy warunek: **wszystko działa lokalnie**. Mózg to lokalny model na moim PC, bez abonamentów i bez płacenia za tokeny.

---

## 2. Skąd ten pomysł: dwa źródła

### 2a. Poradnik „How to clip GTA 6 streams with Claude and OpenShorts”
- Pokazuje OpenShorts (plugin/MCP do Claude), który z linku do streama robi klipy 9:16 z napisami i tytułami.
- Wersja hostowana kosztuje minuty (free: 20 min/mies. z watermarkiem). **Self-host jest darmowy** (MIT, Docker).
- Główna teza o pieniądzach: **clipping programs płacą za wyświetlenia**, Whop Content Rewards jest najbardziej znany.

### 2b. Rolka na IG: „GTA VI clipfinder chat”
Streszczenie: gdy na streamie dzieje się coś szalonego, czat wybucha setkami „LMAO” i **ten spike to twój klip**. Autor ma mały tool: darmowa apka pobiera cały czat streama, tool liczy wiadomości co 10 s, tnie klip w miejscu spike'a w pionie i **zaczyna 20 s wcześniej, bo czat reaguje po fakcie**. Jedna komenda daje setki klipów, potem wrzuca je do OpenShorts na napisy.
Autor sprzedaje to jako płatny serwis. **Nie kupujemy go i nie robimy reverse engineeringu.** Koncept jest prosty i publiczny, napiszemy własny, lepszy.

---

## 3. Co już mam (do wykorzystania)

- **`ranking-yt-short`**: mój skrypt. Jednym kliknięciem wybiera 5 klipów z biblioteki, robi montaż wg stałego szablonu (ten sam overlay i kolory, inne napisy) i od razu uploaduje na YouTube. Może być ostatnim etapem pipeline'u (format „TOP 5 momentów dnia z GTA VI”).
- **LocalAgent („lokal”)**: mój agent na Ollamie, z czatem i akceptacjami przez **ntfy** (Telegram jest zablokowany w sieci akademika). Ma gotowy mechanizm „zapytaj mnie na telefonie zanim zrobisz coś ryzykownego”, który pasuje idealnie do akceptacji klipów.
- **Sprzęt**:
  - mój PC z **RTX 3090 (24 GB VRAM)**, główna maszyna 24/7,
  - PC Sylwka z drugą kartą klasy 3090, opcjonalnie pod większy model albo drugą pulę streamów,
  - MacBook Pro M3 Pro 18 GB, **nie** do pracy 24/7, najwyżej do sterowania i podglądu.

---

## 4. Kluczowe znalezisko techniczne: OpenShorts da się w pełni zlokalizować

Przejrzałem repo `github.com/mutonby/openshorts` (MIT):

- **`llm_backend.py`**: wybór momentów może iść przez **dowolny serwer OpenAI-compatible**. W `.env` ustawiasz `LLM_BASE_URL=http://host.docker.internal:11434/v1` (Ollama na hoście) i `LLM_MODEL=qwen2.5:14b`, a klucz Gemini przestaje być wymagany. Są też `LLM_SCORE_BATCH` (domyślnie 3 dla lokalnych) i `LLM_TIMEOUT`.
- **Co nadal wymaga Gemini** (bo patrzy na klatki wideo):
  - `layout_picker.py`: dobór układu kadru,
  - `screencast_layout.py`: detekcja treści na ekranie,
  - ścieżka „silent video”.

  Bez klucza dwa pierwsze zwracają „none”, a trzecia kończy job błędem. Dla nas wyjścia są dwa: darmowy klucz Gemini tylko do tego albo **stały layout per streamer** (kamerka + gameplay), co dla GTA jest i tak lepsze.
- **GPU build**: w `docker-compose.override.yml` ustawiasz `GPU: "1"` i capabilities `[gpu, video]`, co daje Whisper/Parakeet na CUDA i kodowanie NVENC. README podaje ~1 min na 8-min wideo z GPU vs 5–8 min na CPU. `.env.example` sugeruje `WHISPER_MODEL=large-v3-turbo WHISPER_DEVICE=cuda WHISPER_COMPUTE=float16`, a `ASR_GPU_CONCURRENCY=1`.
- **`twitch_signals.py`**: OpenShorts potrafi już użyć **klipów zrobionych przez widzów Twitcha** (Helix API, `vod_offset`, liczba wyświetleń) jako sygnału do wyboru momentów. Potrzebuje `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (app token, bez konta usera). Autorzy sami piszą, że w gamingu transkrypcja zawodzi, bo pościg to często krzyk i 12 sekund ciszy. **Spike'ów czatu OpenShorts nie ma**, więc to nasza wartość dodana.
- Ma **REST API, MCP server i webhooki** (job → POST z linkami do klipów), więc da się go sterować z naszego kodu bez klikania w dashboard.
- Na Windowsie działa przez Docker Desktop + WSL2 z GPU **[zweryfikować na moim PC]**.

Wniosek: **nie budujemy klipera od zera**. OpenShorts robi transkrypcję, reframe, napisy i tytuły, a my dokładamy detektor momentów z czatu, nagrywanie, orkiestrację, akceptację i publikację.

---

## 5. Opis systemu (komponenty, nie kolejność prac)

1. **Recorder**: dla każdego obserwowanego kanału (Twitch, ewentualnie YouTube/Kick) trzyma **bufor kroczący** ostatnich kilku minut streama (np. `streamlink` + `ffmpeg` w segmentach). Alternatywny tryb VOD: po streamie pobiera nagranie albo dostaje plik od kampanii.
2. **Chat listener / clipfinder**: na żywo słucha czatu (Twitch czat to IRC, bardzo tanie), a w trybie VOD pobiera cały czat z nagrania (np. TwitchDownloaderCLI albo `chat-downloader` **[zweryfikować, który działa najlepiej]**). Liczy „temperaturę” czatu i emituje timestampy kandydatów.
3. **Cutter**: wycina z bufora ~60–90 s wokół kandydata (z pre-rollem, patrz smaczki).
4. **Kliper (OpenShorts self-hosted, GPU)**: transkrypcja, wybór najlepszego 15–60 s kawałka przez lokalny LLM, reframe 9:16, napisy word-by-word, tytuł i hook.
5. **Mózg (Ollama na 3090)**: ocena kandydata (transkrypcja + próbka czatu + metadane), tytuł, opis, hashtagi i odrzucanie śmieci. Model **woła się tylko na wycinki**, nie na całe streamy, i dlatego kilkanaście kanałów jest realne.
6. **Akceptacja (ntfy)**: na telefon idzie podgląd klipu + tytuł, a ja klikam OK / odrzuć / popraw. Na start **obowiązkowo człowiek w pętli**.
7. **Publisher**: upload na YT Shorts (moje API / `ranking-yt-short`), TikTok, Reels oraz **zgłoszenie linku do kampanii** na Whopie.
8. **Tracker**: co zostało opublikowane, na jakim koncie, do której kampanii, ile wyświetleń i ile zarobione. Jest potrzebny do rozliczeń i do strojenia progów.

---

## 6. Monetyzacja: na co uważam, że warto zwrócić uwagę

### 6a. Clipping campaigns (Whop Content Rewards i podobne): główne źródło
Jak to działa (z poradnika):
- Właściciel (streamer, twórca, marka) zakłada kampanię: **stawka za 1000 wyświetleń, budżet, zasady** (jakie treści, gdzie postować, co tagować).
- Dołączenie jest **darmowe**. **Kampania, która każe płacić za wejście, to scam.**
- Wiele kampanii **samo udostępnia nagrania albo surowe pliki**, co rozwiązuje kwestię praw i jakości.
- Postujesz na **własnych kontach** (TikTok/Reels/Shorts) i zgłaszasz linki.
- Płatność za wyświetlenia, zwykle z **minimum i limitem na klip**, aż do wyczerpania budżetu.

Smaczki i ryzyka:
- **Budżety są często „kto pierwszy, ten lepszy”**, więc szybkość publikacji to główna przewaga, a automatyzacja daje nam właśnie ją. Wygrywa post w ciągu godzin od momentu, nie dni.
- **Właściciel może odrzucić klip, nawet gdy ma już wyświetlenia**, jeśli łamie zasady. Każda kampania ma inne zasady, więc system musi mieć **profil kampanii** (dozwolone treści, długości, wymagane tagi/wzmianki/teksty, platformy) i stosować go automatycznie.
- Stawki bardzo się różnią: zawsze patrz na **stawkę, cap na klip i minimum wypłaty**. Opłacają się kampanie z niskim minimum i wysokim capem.
- Przed czwartkiem trzeba **znaleźć i dołączyć do kampanii streamerów grających w GTA VI** **[zweryfikować, jakie są dostępne]**. Bez tego nie ma komu wysyłać klipów.
- Kampanie zwykle chcą **angielskich** treści i globalnych platform. Polski rynek to opcja poboczna (polscy streamerzy GTA), mniejszy, ale z mniejszą konkurencją.

### 6b. Monetyzacja YouTube (YPP): poboczna, niepewna
- Polityka **„reused content”**: kompilacje cudzych materiałów bez własnego wkładu bywają demonetyzowane albo odrzucane przy aplikacji do YPP. Własny wkład (ranking, komentarz, narracja, format „TOP 5 dnia” z `ranking-yt-short`) zwiększa szanse.
- Na Shortsach zarabia się mało za wyświetlenie. Traktowałbym to jako bonus, a nie model biznesowy.

### 6c. Prawa i bezpieczeństwo kanałów
- **Klipujemy tylko streamerów, którzy na to pozwalają** (kampania lub wyraźna zgoda). To nie tylko etyka: strike'i i claimy zabiją kanał w tygodniu premiery.
- **Muzyka na streamach**: streamerzy często grają muzykę w tle, a to Content ID/DMCA. Warto wykrywać albo omijać takie fragmenty, a radio w samym GTA też może być claimowane **[zweryfikować]**.
- **Rockstar/Take-Two** ma własne zasady dla gameplay: krótkie highlighty OK, **zero leaków** i treści sprzed premiery z nielegalnych źródeł.
- **Żadnych pełnych streamów ani długich kawałków**, tylko krótkie highlighty.
- **Masowy automatyczny upload** łatwo wygląda na spam dla platform. Lepiej mniej i lepiej, z ludzką akceptacją, rozsądne tempo i różne tytuły.

---

## 7. Smaczki techniczne (rzeczy łatwe do przeoczenia)

**Detekcja momentów z czatu:**
- **Pre-roll ~20 s** (z rolki): czat reaguje po fakcie. Ja dodałbym, żeby wartość była per streamer, bo zależy od opóźnienia streama i wielkości czatu.
- **Próg względny, nie absolutny**: spike = aktywność vs średnia krocząca z ostatnich kilku minut (np. z-score). U dużego streamera 50 msg/10 s to cisza, u małego to wybuch.
- **Wagi na treść, nie tylko liczba**: `LMAO`, `KEKW`, `OMEGALUL`, `LUL`, `💀`, `CLIP IT`, `CLIP THAT`, `???`, `W`, `L`, caps lock. Polskie odpowiedniki dla PL streamerów.
- **Filtr fałszywych spike'ów**: suby, gift suby, raidy, bity, giveaway'e, komendy botów, emote-only spam po hasłach streamera. Ich wiadomości systemowe (USERNOTICE) da się rozpoznać.
- **Łączenie bliskich spike'ów** w jeden moment, plus cooldown.
- **Drugi sygnał**: klipy robione przez widzów na Twitchu (już obsługiwane przez `twitch_signals.py`). Gdy widzowie sami klipują, to mocny dowód.
- Ewentualnie trzeci sygnał: **głośność audio** (krzyk streamera), bo w GTA pościg to często krzyk bez słów.

**Kadrowanie i montaż:**
- Dla GTA najlepiej działa **stały layout per streamer**: kamerka u góry, gameplay na dole (współrzędne kamerki ustawiane raz). Jest pewniejszy niż face-tracking i nie wymaga Gemini.
- **Start od akcji, zero intro, jeden moment na klip.** Tytuł opisuje moment („Uciekł 6 radiowozom bez opon”).
- Napisy: karaoke / word-by-word, duże, kontrastowe.

**Wydajność i infrastruktura:**
- **Łącze to realny limit**, nie GPU: kilkanaście streamów w 1080p to ok. 50–100 Mb/s non-stop. Bufor nagrywać w 720p/480p, a w pełnej jakości dociągać tylko wybrane fragmenty (albo brać pliki od kampanii).
- **VRAM 24 GB**: Whisper large-v3-turbo + Qwen 14B mieszczą się na jednej karcie. Większy model (np. Qwen 32B Q4, ~20 GB) wymaga drugiej karty, czyli PC Sylwka jako serwera LLM w sieci.
- NVENC do renderu, bo nie blokuje CPU.
- **Dysk**: bufory kroczące muszą się kasować same, inaczej dysk zapełni się w dobę.
- **VOD-y na Twitchu znikają albo mają wyciszone fragmenty**: w trybie VOD pobierać szybko.

**Limity platform:**
- **YouTube Data API**: domyślnie 10 000 jednostek/dzień, upload ≈ 1600, czyli **~6 uploadów dziennie na projekt API** **[zweryfikować]**. Mi to wystarcza, a w razie potrzeby można złożyć wniosek o zwiększenie.
- **TikTok** przez API zwykle ląduje jako **draft** w apce i wymaga ręcznego zatwierdzenia (wg poradnika przez OpenShorts). Instagram i YouTube publikują od razu.
- Zasady platform co do wielu kont jednej osoby **[zweryfikować]**.

**Jakość wyboru (największe ryzyko „taste”):**
- AI dobrze znajduje momenty, gorzej ocenia, czy są naprawdę śmieszne. Stąd **człowiek w pętli przez ntfy**, przynajmniej na początku. Z moich OK/odrzuć zbieramy dane do strojenia progów i promptów.

---

## 8. Czas: dlaczego to pilne

- Premiera **czwartek 19.11.2026**. Okno największego popytu na klipy to **pierwsze dni i tydzień premiery**: pierwsze reakcje, pierwsza jazda, pierwsze pościgi, glitche premierowe.
- Najlepiej, żeby **co najmniej tryb VOD + OpenShorts + ręczny upload** działał przed czwartkiem, a tryb na żywo dochodził w trakcie. Działający prosty system w czwartek jest wart więcej niż idealny za tydzień.
- Co klipować (z poradnika): first reactions, pościgi z policją, crashe, faile, **glitche i bugi premierowe** (jedne z najczęściej udostępnianych), dziwne sytuacje z NPC.

---

## 9. Ograniczenia i preferencje (twarde)

- **Lokalnie, bez abonamentów i bez płatnych tokenów.** Wyjątkiem może być darmowy klucz Gemini do layoutu, ale tylko jeśli stały layout per streamer nie wystarczy.
- Główna maszyna to **mój PC z 3090**, nie Mac.
- **Bezpieczeństwo**: wszystko, co publikuje, zgłasza do kampanii albo może naruszyć zasady, przechodzi przez akceptację ntfy.
- Bez kupowania ani klonowania płatnego serwisu autora rolki.
- Kod ma być prosty do utrzymania przeze mnie (Python), z sensownym logowaniem.

---

## 10. Otwarte pytania do rozstrzygnięcia przy planowaniu

1. Których streamerów/kampanii celujemy na start (2–3 kanały do testu, potem skala)? Angielskie czy też polskie?
2. Tryb VOD vs na żywo: od czego zaczynamy przed czwartkiem?
3. Jedna karta (mój PC) czy podział z PC Sylwka?
4. Platformy: tylko YT Shorts + TikTok, czy też Reels? Ile kont?
5. Czy `ranking-yt-short` (format TOP 5) zostaje jako osobny produkt na własnym kanale obok klipów do kampanii?
6. Stały layout per streamer czy darmowy klucz Gemini do automatycznego layoutu?
7. Jak mierzymy sukces: wyświetlenia, zarobek z kampanii, % klipów zaakceptowanych przez mnie?

---

## 11. Linki

- OpenShorts repo (MIT): https://github.com/mutonby/openshorts (README sekcje: GPU acceleration, Run without a Google key; pliki `llm_backend.py`, `twitch_signals.py`, `.env.example`)
- OpenShorts MCP (hostowany, nie używamy przy self-host): `https://mcp.openshorts.app/mcp`
- Whop Content Rewards: marketplace clipping campaigns **[znaleźć aktualne kampanie GTA VI]**
