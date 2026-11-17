<#
  Jednorazowa instalacja gta-clippera na swiezym komputerze z Windows (np. RTX 3090 24 GB).
  Uruchom w folderze projektu:   powershell -ExecutionPolicy Bypass -File .\setup_windows.ps1
  Mozna uruchamiac wielokrotnie: kazdy krok najpierw sprawdza, czy juz jest zrobiony.

  Parametry:
    -OllamaModel  model LLM do pobrania (domyslnie qwen2.5:14b, miesci sie w 24 GB VRAM)
    -SkipTests    pomija test na koncu

  Dlaczego pakiety nvidia-cublas-cu12 i nvidia-cudnn-cu12 (a nie caly torch):
  faster-whisper dziala na ctranslate2, ktory na GPU potrzebuje tylko bibliotek cuBLAS i cuDNN
  z CUDA 12. Te dwa pakiety pip daja gotowe DLL-ki (bez instalowania CUDA Toolkit i bez
  ciezkiego torcha). Sterownik NVIDIA musi byc aktualny. Przed startem Whispera dopisujemy ich
  katalogi bin do PATH w pliku run_clipper.cmd.
#>
param(
    [string]$OllamaModel = "qwen2.5:14b",
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Ensure-Winget($command, $wingetId, $label) {
    if (Have $command) {
        Write-Host "[ok] $label jest zainstalowany"
        return
    }
    if (-not (Have "winget")) {
        throw "Brak winget. Zainstaluj '$label' recznie i uruchom skrypt jeszcze raz."
    }
    Write-Host "[instalacja] $label ($wingetId)"
    winget install --id $wingetId -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Have $command)) {
        Write-Warning "$label zainstalowany, ale nie widac go w PATH. Zamknij okno, otworz nowe i uruchom skrypt ponownie."
    }
}

Write-Host "== 1. Programy systemowe =="
# Python 3.11: sprawdzamy przez launcher 'py', zeby nie pomylic z innym Pythonem
$py311 = $false
if (Have "py") {
    # PowerShell 5 z "Stop" przerywa skrypt na stderr programu, stad lokalne Continue
    $ErrorActionPreference = "Continue"
    & py -3.11 --version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $py311 = $true }
    $ErrorActionPreference = "Stop"
}
if ($py311) {
    Write-Host "[ok] Python 3.11 jest zainstalowany"
} else {
    if (-not (Have "winget")) { throw "Brak winget. Zainstaluj Python 3.11 recznie." }
    Write-Host "[instalacja] Python 3.11"
    winget install --id Python.Python.3.11 -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
}
Ensure-Winget "ffmpeg" "Gyan.FFmpeg" "ffmpeg"
Ensure-Winget "yt-dlp" "yt-dlp.yt-dlp" "yt-dlp"
Ensure-Winget "ollama" "Ollama.Ollama" "Ollama"

Write-Host "== 2. Srodowisko Pythona (.venv) =="
$venvPy = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    # zwykly venv, bez --system-site-packages
    & py -3.11 -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Nie udalo sie utworzyc .venv" }
} else {
    Write-Host "[ok] .venv juz istnieje"
}
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -e ".[dev]" streamlink
if ($LASTEXITCODE -ne 0) { throw "pip install nie powiodl sie" }

Write-Host "== 3. Biblioteki CUDA 12 dla Whispera (tylko jesli jest karta NVIDIA) =="
if (Have "nvidia-smi") {
    & $venvPy -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
    if ($LASTEXITCODE -ne 0) { Write-Warning "Instalacja bibliotek CUDA nie powiodla sie; Whisper moze dzialac tylko na CPU" }
    # Plik startowy dokladajacy DLL-ki do PATH, uruchamiaj clippera przez niego
    $runner = Join-Path $PSScriptRoot "run_clipper.cmd"
    $site = & $venvPy -c "import site; print(site.getsitepackages()[-1])"
    $lines = @(
        "@echo off",
        "rem Dodaje DLL-ki cuBLAS i cuDNN (pakiety pip nvidia-*) do PATH i uruchamia clippera",
        "set PYTHONUTF8=1",
        "set PYTHONIOENCODING=utf-8",
        "set PATH=$site\nvidia\cublas\bin;$site\nvidia\cudnn\bin;%PATH%",
        "`"$venvPy`" -m clipper.cli %*"
    )
    Set-Content -Path $runner -Value $lines -Encoding ASCII
    Write-Host "[ok] zapisano run_clipper.cmd (uzywaj: run_clipper.cmd live ...)"
} else {
    Write-Warning "Nie widac nvidia-smi: pomijam CUDA. Zainstaluj sterownik NVIDIA i uruchom skrypt ponownie."
}

Write-Host "== 4. Model Ollamy: $OllamaModel =="
if (Have "ollama") {
    & ollama pull $OllamaModel
    if ($LASTEXITCODE -ne 0) { Write-Warning "Nie udalo sie pobrac modelu. Uruchom aplikacje Ollama i powtorz: ollama pull $OllamaModel" }
} else {
    Write-Warning "Ollama nie jest w PATH (zamknij okno, otworz nowe i uruchom skrypt ponownie)."
}

Write-Host "== 5. Plik .env =="
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "[ok] skopiowano .env.example -> .env"
    } else {
        Write-Warning "Brak .env.example (agencyjny .gitignore ma wzor .env.*, wiec plik mogl sie nie skopiowac razem z repo). Skopiuj go recznie z pierwszego komputera."
    }
} else {
    Write-Host "[ok] .env juz istnieje, nie nadpisuje"
}
Write-Host ""
Write-Host "Uzupelnij w .env:"
Write-Host "  NTFY_TOPIC            wlasny, losowy temat (nie ten sam co na drugim komputerze)"
Write-Host "  TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET   mozna uzyc tych samych kluczy aplikacji Twitch"
Write-Host "  YOUTUBE_CLIENT_SECRETS   wlasny plik OAuth z Google Cloud, potem: clipper auth"
Write-Host "  CLIPPER_DATA_DIR      katalog na bufory i klipy (duzo miejsca)"
Write-Host "  OLLAMA_MODEL=$OllamaModel"
Write-Host "  WHISPER_DEVICE=cuda   (przy RTX 3090 mozna wziac wiekszy model Whispera, np. large-v3)"
Write-Host ""

if (-not $SkipTests) {
    Write-Host "== 6. Testy =="
    & $venvPy -m pytest -q
    if ($LASTEXITCODE -ne 0) { Write-Warning "Czesc testow nie przeszla, sprawdz wynik powyzej." }
}

Write-Host "Gotowe."
