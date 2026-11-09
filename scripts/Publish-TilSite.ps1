[CmdletBinding()]
param([switch] $CardOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
[string[]]$paths = if ($CardOnly) { @('assets/card') } else { @('site', 'assets/card') }
Push-Location $repoRoot
try {
    & git add -A -- @paths
    if ($LASTEXITCODE) { throw 'Could not stage site content' }
    & git diff --cached --quiet -- @paths
    if ($LASTEXITCODE -eq 1) {
        & git commit -m 'Publish site content' -- @paths
        if ($LASTEXITCODE) { throw 'Could not commit site content' }
    } elseif ($LASTEXITCODE -gt 1) { throw 'Could not inspect staged site changes' }
    & git push origin main
    if ($LASTEXITCODE) { throw 'Could not push site content' }
    Write-Host 'Published site source; the push-triggered Pages deployment will run automatically.'
} finally { Pop-Location }
