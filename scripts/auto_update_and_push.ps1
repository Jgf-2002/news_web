param(
    [string]$SourceDir = "C:\Cloud_code\newsai",
    [int]$CacheTail = 140,
    [int]$MaxItems = 160,
    [int]$MinPushIntervalSeconds = 120
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$GitExe = "C:\Program Files\Git\cmd\git.exe"
$FeedFile = "data/normalized/feed.json"
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$LastPushFile = Join-Path $RuntimeDir "last_push_utc.txt"

function Get-LastPushUtc() {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return $null
    }
    try {
        $raw = (Get-Content $Path -Raw -ErrorAction Stop).Trim()
        if (-not $raw) {
            return $null
        }
        return [DateTime]::Parse($raw, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
    } catch {
        return $null
    }
}

function Set-LastPushUtc() {
    param([string]$Path, [DateTime]$UtcNow)
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
    Set-Content -Path $Path -Value $UtcNow.ToString("o") -Encoding UTF8
}

if (-not (Test-Path $GitExe)) {
    throw "Git not found at $GitExe"
}

Write-Host "[auto] project_root=$ProjectRoot"

& (Join-Path $ScriptDir "run_pipeline.ps1") `
    -SourceDir $SourceDir `
    -CacheTail $CacheTail `
    -MaxItems $MaxItems

if ($LASTEXITCODE -ne 0) {
    throw "run_pipeline.ps1 failed with exit code $LASTEXITCODE"
}

Push-Location $ProjectRoot
try {
    & $GitExe add -- $FeedFile
    if ($LASTEXITCODE -ne 0) {
        throw "git add failed with exit code $LASTEXITCODE"
    }

    & $GitExe diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[auto] no feed changes; skip commit/push"
        exit 0
    }

    $nowUtc = [DateTime]::UtcNow
    $lastPushUtc = Get-LastPushUtc -Path $LastPushFile
    if ($lastPushUtc) {
        $elapsed = ($nowUtc - $lastPushUtc).TotalSeconds
        if ($elapsed -lt $MinPushIntervalSeconds) {
            $remaining = [Math]::Ceiling($MinPushIntervalSeconds - $elapsed)
            Write-Host "[auto] push throttled; next push in ${remaining}s"
            exit 0
        }
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    & $GitExe commit -m "auto update $timestamp"
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed with exit code $LASTEXITCODE"
    }

    & $GitExe push
    if ($LASTEXITCODE -ne 0) {
        throw "git push failed with exit code $LASTEXITCODE"
    }

    Set-LastPushUtc -Path $LastPushFile -UtcNow $nowUtc

    Write-Host "[auto] pushed feed update"
}
finally {
    Pop-Location
}
