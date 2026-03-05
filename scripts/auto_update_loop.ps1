param(
    [int]$IntervalSeconds = 30,
    [int]$MaxIterations = 0,
    [string]$SourceDir = "C:\Cloud_code\newsai",
    [int]$CacheTail = 140,
    [int]$MaxItems = 160
)

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerScript = Join-Path $ScriptDir "auto_update_and_push.ps1"

if (-not (Test-Path $WorkerScript)) {
    throw "Worker script not found: $WorkerScript"
}

if ($IntervalSeconds -lt 5) {
    $IntervalSeconds = 5
}

Write-Host "[loop] started interval=${IntervalSeconds}s worker=$WorkerScript"

$iteration = 0
while ($true) {
    $iteration += 1

    try {
        & $WorkerScript `
            -SourceDir $SourceDir `
            -CacheTail $CacheTail `
            -MaxItems $MaxItems
    } catch {
        Write-Warning ("[loop] worker failed: " + $_.Exception.Message)
    }

    if ($MaxIterations -gt 0 -and $iteration -ge $MaxIterations) {
        Write-Host "[loop] reached max iterations: $MaxIterations"
        break
    }

    Start-Sleep -Seconds $IntervalSeconds
}
