param(
    [string]$SourceDir = "C:\Cloud_code\newsai",
    [int]$CacheTail = 140,
    [int]$MaxItems = 160
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$GitExe = "C:\Program Files\Git\cmd\git.exe"
$FeedFile = "data/normalized/feed.json"

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

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    & $GitExe commit -m "auto update $timestamp"
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed with exit code $LASTEXITCODE"
    }

    & $GitExe push
    if ($LASTEXITCODE -ne 0) {
        throw "git push failed with exit code $LASTEXITCODE"
    }

    Write-Host "[auto] pushed feed update"
}
finally {
    Pop-Location
}
