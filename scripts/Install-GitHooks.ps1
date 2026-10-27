[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
& git -C $repoRoot config core.hooksPath .githooks
if ($LASTEXITCODE) {
    throw "Could not configure core.hooksPath in $repoRoot"
}
Write-Host "Git hooks enabled for $repoRoot"
