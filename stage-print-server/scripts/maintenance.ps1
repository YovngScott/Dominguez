param([switch]$Resume)
$ErrorActionPreference='Stop'
$dataFolder=Join-Path $env:APPDATA 'stage-ai-labs-print-server'
$pauseFile=Join-Path $dataFolder 'pausar-receptor.flag'
$application=Join-Path $env:LOCALAPPDATA 'Programs\STAGE AI LABS Print Server\STAGE AI LABS Print Server.exe'
New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
if ($Resume) {
    Remove-Item -LiteralPath $pauseFile -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $application -ArgumentList '--hidden' -WindowStyle Hidden
    Write-Output 'Receptor reanudado. Comprueba que indique Conectada.'
} else {
    [System.IO.File]::WriteAllText($pauseFile,'Pausa para mantenimiento')
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $application } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Output 'Receptor pausado para mantenimiento. Usa REANUDAR para volver a imprimir.'
}
