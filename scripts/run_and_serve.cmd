@echo off
setlocal

set "SOURCE_DIR=C:\Cloud_code\newsai"
set "CACHE_TAIL=140"
set "MAX_ITEMS=160"
set "PORT=8080"

if not "%~1"=="" set "SOURCE_DIR=%~1"
if not "%~2"=="" set "CACHE_TAIL=%~2"
if not "%~3"=="" set "MAX_ITEMS=%~3"
if not "%~4"=="" set "PORT=%~4"

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

pushd "%PROJECT_ROOT%" >nul

echo [run] project_root=%CD%
echo [run] source_dir=%SOURCE_DIR%
echo [run] cache_tail=%CACHE_TAIL%
echo [run] max_items=%MAX_ITEMS%

for /f %%P in ('powershell -NoProfile -Command "$port='%PORT%'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -match ('-m\\s+http\\.server\\s+' + [regex]::Escape($port) + '(\\s|$)') } | ForEach-Object { $_.ProcessId }"') do (
  if not "%%P"=="" (
    echo [run] stopping existing http.server pid=%%P on port %PORT%
    taskkill /PID %%P /F >nul 2>&1
  )
)

py ".\scripts\sync_from_newsai.py" --source-dir "%SOURCE_DIR%" --raw-dir ".\data\raw" --cache-tail %CACHE_TAIL%
if errorlevel 1 (
  echo [run] sync_from_newsai.py failed
  popd >nul
  exit /b 1
)

py ".\scripts\normalize_feed.py" --raw-dir ".\data\raw" --output-file ".\data\normalized\feed.json" --max-items %MAX_ITEMS% --cache-items %CACHE_TAIL%
if errorlevel 1 (
  echo [run] normalize_feed.py failed
  popd >nul
  exit /b 1
)

echo [run] serving at http://localhost:%PORT%/web/index.html
py -m http.server %PORT%

popd >nul
endlocal
