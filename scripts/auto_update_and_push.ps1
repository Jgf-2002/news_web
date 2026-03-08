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
$TrackedOutputs = @(
    "data/normalized/feed.json",
    "data/normalized/market-data.json"
)
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$LastPushFile = Join-Path $RuntimeDir "last_push_utc.txt"
$SyncMutexName = "Global\NewsWebAutoSyncMutex"

if (-not (Test-Path $GitExe)) {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCommand) {
        throw "Git executable not found."
    }
    $GitExe = $gitCommand.Source
}

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

function Invoke-GitCapture() {
    param([string[]]$Arguments)
    $output = & $GitExe @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($output)
    }
}

function Assert-GitSuccess() {
    param(
        [int]$ExitCode,
        [string]$Message
    )
    if ($ExitCode -ne 0) {
        throw $Message
    }
}

function Parse-StatusPath() {
    param([string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line) -or $Line.Length -lt 4) {
        return $null
    }

    $path = $Line.Substring(3).Trim()
    if ($path -like "* -> *") {
        $path = ($path -split " -> ")[-1]
    }
    return $path.Replace("\", "/")
}

function Get-TrackedStatusLines() {
    $result = Invoke-GitCapture -Arguments @("status", "--porcelain")
    Assert-GitSuccess -ExitCode $result.ExitCode -Message "git status failed with exit code $($result.ExitCode)"
    return @($result.Output | Where-Object { $_ -and $_ -notmatch '^\?\?' -and $_ -notmatch '^!!' })
}

function Get-OutputStatusLines() {
    $args = @("status", "--porcelain", "--")
    $args += $TrackedOutputs
    $result = Invoke-GitCapture -Arguments $args
    Assert-GitSuccess -ExitCode $result.ExitCode -Message "git status for outputs failed with exit code $($result.ExitCode)"
    return @($result.Output | Where-Object { $_ })
}

function Test-UnrelatedTrackedChanges() {
    $allowed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($path in $TrackedOutputs) {
        [void]$allowed.Add($path)
    }

    $unrelated = New-Object System.Collections.Generic.List[string]
    foreach ($line in Get-TrackedStatusLines) {
        $path = Parse-StatusPath -Line ([string]$line)
        if ($path -and -not $allowed.Contains($path)) {
            [void]$unrelated.Add($path)
        }
    }

    return ,$unrelated
}

function Get-AheadBehindCounts() {
    $result = Invoke-GitCapture -Arguments @("rev-list", "--left-right", "--count", "origin/main...HEAD")
    Assert-GitSuccess -ExitCode $result.ExitCode -Message "git rev-list failed with exit code $($result.ExitCode)"

    $raw = (($result.Output -join " ").Trim() -split '\s+')
    if ($raw.Count -lt 2) {
        return [pscustomobject]@{ Behind = 0; Ahead = 0 }
    }

    return [pscustomobject]@{
        Behind = [int]$raw[0]
        Ahead = [int]$raw[1]
    }
}

function Acquire-SyncMutex() {
    param([string]$Name)
    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($false, $Name, [ref]$createdNew)
    if (-not $mutex.WaitOne(0)) {
        Write-Warning "[auto] another sync worker is already running; skip this iteration"
        $mutex.Dispose()
        return $null
    }
    return $mutex
}

Push-Location $ProjectRoot
$syncMutex = $null
try {
    $syncMutex = Acquire-SyncMutex -Name $SyncMutexName
    if (-not $syncMutex) {
        exit 0
    }

    Write-Host "[auto] project_root=$ProjectRoot"

    $currentBranch = (& $GitExe branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "git branch --show-current failed with exit code $LASTEXITCODE"
    }
    if ($currentBranch -ne "main") {
        Write-Warning "[auto] expected branch 'main' but found '$currentBranch'; skip auto push"
        exit 0
    }

    $remoteUrl = (& $GitExe remote get-url origin 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) {
        throw "origin remote is not configured"
    }

    $unrelatedChanges = Test-UnrelatedTrackedChanges
    if ($unrelatedChanges.Count -gt 0) {
        Write-Warning ("[auto] tracked changes outside publish outputs; skip auto push -> " + ($unrelatedChanges -join ", "))
        exit 0
    }

    & $GitExe fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "git fetch origin main failed with exit code $LASTEXITCODE"
    }

    $syncState = Get-AheadBehindCounts
    if ($syncState.Behind -gt 0) {
        Write-Host "[auto] pulling latest origin/main before pipeline"
        & $GitExe pull --rebase origin main
        if ($LASTEXITCODE -ne 0) {
            throw "git pull --rebase origin main failed with exit code $LASTEXITCODE"
        }
    }

    & (Join-Path $ScriptDir "run_pipeline.ps1") `
        -SourceDir $SourceDir `
        -CacheTail $CacheTail `
        -MaxItems $MaxItems

    if ($LASTEXITCODE -ne 0) {
        throw "run_pipeline.ps1 failed with exit code $LASTEXITCODE"
    }

    $outputChanges = Get-OutputStatusLines
    if ($outputChanges.Count -eq 0) {
        Write-Host "[auto] no output changes; skip commit/push"
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

    & $GitExe fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        throw "git fetch origin main failed with exit code $LASTEXITCODE"
    }

    $postPipelineSync = Get-AheadBehindCounts
    if ($postPipelineSync.Behind -gt 0) {
        Write-Warning "[auto] remote advanced during pipeline; retry on next loop"
        exit 0
    }

    & $GitExe add -- @TrackedOutputs
    if ($LASTEXITCODE -ne 0) {
        throw "git add failed with exit code $LASTEXITCODE"
    }

    & $GitExe diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[auto] no staged output delta; skip commit/push"
        exit 0
    }
    if ($LASTEXITCODE -ne 1) {
        throw "git diff --cached --quiet failed with exit code $LASTEXITCODE"
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    & $GitExe commit -m "auto update $timestamp"
    if ($LASTEXITCODE -ne 0) {
        throw "git commit failed with exit code $LASTEXITCODE"
    }

    & $GitExe push origin main
    if ($LASTEXITCODE -ne 0) {
        throw "git push origin main failed with exit code $LASTEXITCODE"
    }

    Set-LastPushUtc -Path $LastPushFile -UtcNow $nowUtc
    Write-Host "[auto] pushed normalized feed + market data"
}
finally {
    if ($syncMutex) {
        $syncMutex.ReleaseMutex()
        $syncMutex.Dispose()
    }
    Pop-Location
}
