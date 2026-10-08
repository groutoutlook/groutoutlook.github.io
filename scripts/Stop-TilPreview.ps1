param([ValidateRange(1024, 65535)][int] $Port = 1337)
$ErrorActionPreference = 'Stop'
$site = Join-Path (Split-Path -Parent $PSScriptRoot) 'site'
$servers = @(Get-CimInstance Win32_Process -Filter "Name = 'miniserve.exe'" | Where-Object { $_.CommandLine -match "--port\s+$Port\s" -and $_.CommandLine.Contains($site) })
if ($servers.Count -eq 0) { Write-Host "No site preview is running on port $Port."; exit 0 }
foreach ($server in $servers) {
    Stop-Process -Id $server.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Stopped preview on http://127.0.0.1:$Port/."
