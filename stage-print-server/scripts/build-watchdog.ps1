$ErrorActionPreference = 'Stop'
$sourceFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'No se encontro el compilador de .NET Framework.' }
$output = Join-Path $sourceFolder 'watchdog-launcher.exe'
& $compiler /nologo /target:winexe /optimize+ ('/out:' + $output) (Join-Path $sourceFolder 'watchdog-launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el supervisor sin consola.' }
Write-Output ('Supervisor sin consola generado: ' + $output)
