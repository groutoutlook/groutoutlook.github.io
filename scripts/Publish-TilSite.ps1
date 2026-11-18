[CmdletBinding()]
param([switch] $CardOnly, [switch] $Quiet)
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
        & git commit -m 'Publish site content' -- @paths | Out-Null
        if ($LASTEXITCODE) { throw 'Could not commit site content' }
    } elseif ($LASTEXITCODE -gt 1) { throw 'Could not inspect staged site changes' }
    & git push --quiet origin main | Out-Null
    if ($LASTEXITCODE) { throw 'Could not push site content' }
    if (-not $Quiet) { Write-Host 'https://groutoutlook.github.io/' }
} finally { Pop-Location }
