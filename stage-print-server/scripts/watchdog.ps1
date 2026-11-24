param([switch]$Continuous,[switch]$VerifyHidden)
$ErrorActionPreference = 'Stop'
$dataFolder = Join-Path $env:APPDATA 'stage-ai-labs-print-server'
$application = Join-Path $env:LOCALAPPDATA 'Programs\STAGE AI LABS Print Server\STAGE AI LABS Print Server.exe'
$stateFile = Join-Path $dataFolder 'watchdog-state.json'
$pauseFile = Join-Path $dataFolder 'pausar-receptor.flag'
New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
if ($VerifyHidden) {
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WatchdogConsoleCheck { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }'
    $hiddenConsole = [WatchdogConsoleCheck]::GetConsoleWindow() -eq [IntPtr]::Zero
    [System.IO.File]::WriteAllText((Join-Path $dataFolder 'watchdog-hidden-verification.json'), (@{sin_consola=$hiddenConsole;fecha=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    if (-not $hiddenConsole) { exit 7 }
    exit 0
}

function Check-PrintServer {
    if (Test-Path -LiteralPath $pauseFile) { return }
    if (-not (Test-Path -LiteralPath $application)) { return }
    $failures = 0
    try { $failures = [int]((Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json).fallas) } catch {}
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='STAGE AI LABS Print Server.exe'" | Where-Object { $_.ExecutablePath -eq $application })
    $restarted = $false
    if ($processes.Count -eq 0) {
        Start-Process -FilePath $application -ArgumentList '--hidden' -WindowStyle Hidden
        $failures = 0
        $restarted = $true
    } else {
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/health' -TimeoutSec 4
            if ($health.product -ne 'STAGE AI LABS Print Server') { throw 'El receptor no responde.' }
            $failures = 0
        } catch {
            $failures++
            if ($failures -ge 3) {
                foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
                Start-Process -FilePath $application -ArgumentList '--hidden' -WindowStyle Hidden
                $failures = 0
                $restarted = $true
            }
        }
    }
    $record = @{ fallas=$failures; reiniciado=$restarted; ultima_revision=[DateTime]::UtcNow.ToString('o') }
    [System.IO.File]::WriteAllText($stateFile, ($record | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
}

$mutex = [System.Threading.Mutex]::new($false, 'Local\DominguezPrintWatchdog')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
try {
    do {
        try { Check-PrintServer } catch { Write-Error -ErrorRecord $_ -ErrorAction Continue }
        if ($Continuous) { Start-Sleep -Seconds 30 }
    } while ($Continuous)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
