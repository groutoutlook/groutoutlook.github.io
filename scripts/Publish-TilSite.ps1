[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    & git add -A -- site
    if ($LASTEXITCODE) { throw 'Could not stage generated site' }

    & git diff --cached --quiet -- site
    if ($LASTEXITCODE -eq 1) {
        & git commit -m 'Publish TIL site' -- site
        if ($LASTEXITCODE) { throw 'Could not commit generated site' }
    } elseif ($LASTEXITCODE -gt 1) {
        throw 'Could not inspect staged site changes'
    }

    & git push origin main
    if ($LASTEXITCODE) { throw 'Could not push generated site' }

    Write-Host 'Published site source; the push-triggered Pages deployment will run automatically.'
} finally {
    Pop-Location
}
