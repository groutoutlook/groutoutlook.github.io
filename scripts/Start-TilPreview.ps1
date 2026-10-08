param([ValidateRange(1024, 65535)][int] $Port = 1337)
$ErrorActionPreference = 'Stop'
$site = Join-Path (Split-Path -Parent $PSScriptRoot) 'site'
$url = "http://127.0.0.1:$Port/"
if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains $Port) { throw "Port $Port is already in use. Run just dev with another port." }
$log = Join-Path ([System.IO.Path]::GetTempPath()) "tiller-preview-$([guid]::NewGuid())"
$server = Start-Process -FilePath (Get-Command miniserve -CommandType Application -ErrorAction Stop).Source -ArgumentList @('--port', "$Port", '--interfaces', '127.0.0.1', '--index', 'index.html', "`"$site`"") -WindowStyle Hidden -RedirectStandardOutput "$log.out" -RedirectStandardError "$log.err" -PassThru
try {
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if ($server.HasExited) { throw "Preview server exited. See $log.err" }
        try { Invoke-WebRequest -Uri $url -TimeoutSec 1 -UseBasicParsing | Out-Null; break }
        catch { Start-Sleep -Milliseconds 100 }
    }
    if ($attempt -eq 50) { throw 'Preview server did not become ready.' }
    Write-Host "Preview: $url"
    Start-Process $url
    Wait-Process -Id $server.Id
} finally {
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
}
