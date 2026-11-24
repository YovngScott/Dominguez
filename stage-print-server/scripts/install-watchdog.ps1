$ErrorActionPreference = 'Stop'
$dataFolder = Join-Path $env:APPDATA 'stage-ai-labs-print-server'
New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
$scriptSource = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'watchdog.ps1'
$installedScript = Join-Path $dataFolder 'watchdog.ps1'
Copy-Item -LiteralPath $scriptSource -Destination $installedScript -Force
$launcherSource = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'watchdog-launcher.exe'
if (-not (Test-Path -LiteralPath $launcherSource)) {
    & (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'build-watchdog.ps1')
}
$launcher = Join-Path $dataFolder 'watchdog-launcher.exe'
if (-not (Test-Path -LiteralPath $launcher) -or (Get-FileHash -LiteralPath $launcherSource).Hash -ne (Get-FileHash -LiteralPath $launcher).Hash) {
    Copy-Item -LiteralPath $launcherSource -Destination $launcher -Force
}
$mode = 'Tarea de Windows cada minuto'
try {
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action = New-ScheduledTaskAction -Execute $launcher -WorkingDirectory $dataFolder
    $login = New-ScheduledTaskTrigger -AtLogOn -User $user
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'Dominguez - Recuperar impresora central' -Description 'Recupera el receptor de etiquetas si se cierra inesperadamente.' -Action $action -Trigger @($login,$repeat) -Principal $principal -Settings $settings -Force | Out-Null
} catch {
    # Un Windows sin permiso para crear tareas conserva recuperación automática
    # con un supervisor del usuario. No requiere contraseñas ni administrador.
    $mode = 'Supervisor del usuario cada 30 segundos'
    $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    New-Item -Path $runKey -Force | Out-Null
    $command = '"' + $launcher + '" --continuous'
    New-ItemProperty -LiteralPath $runKey -Name 'DominguezPrintWatchdog' -Value $command -PropertyType String -Force | Out-Null
    Start-Process -FilePath $launcher -ArgumentList '--continuous' -WindowStyle Hidden
}
$mode | Set-Content -LiteralPath (Join-Path $dataFolder 'watchdog-mode.txt') -Encoding ASCII
Write-Output ('Recuperacion automatica instalada: ' + $mode)
