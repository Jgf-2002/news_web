param(
    [string]$SourceDir = "C:\Cloud_code\newsai",
    [int]$CacheTail = 140,
    [int]$MaxItems = 160
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RawDir = Join-Path $ProjectRoot "data\raw"
$OutputFile = Join-Path $ProjectRoot "data\normalized\feed.json"

Write-Host "[pipeline] project_root=$ProjectRoot"
Write-Host "[pipeline] source_dir=$SourceDir"

& py (Join-Path $ScriptDir "sync_from_newsai.py") `
    --source-dir $SourceDir `
    --raw-dir $RawDir `
    --cache-tail $CacheTail

if ($LASTEXITCODE -ne 0) {
    throw "sync_from_newsai.py failed with exit code $LASTEXITCODE"
}

& py (Join-Path $ScriptDir "normalize_feed.py") `
    --raw-dir $RawDir `
    --output-file $OutputFile `
    --max-items $MaxItems `
    --cache-items $CacheTail

if ($LASTEXITCODE -ne 0) {
    throw "normalize_feed.py failed with exit code $LASTEXITCODE"
}

Write-Host "[pipeline] complete"
Write-Host "[pipeline] feed=$OutputFile"
