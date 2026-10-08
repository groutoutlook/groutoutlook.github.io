[CmdletBinding()]
param(
    [switch] $NoSync,
    [string] $TillerRoot = 'D:\ProgramDataD\MiscLang\07.02-Rust\nightly\tiller',
    [string] $TillerExecutable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot 'Sync-TilSources.ps1'
$siteDirectory = Join-Path $repoRoot 'site'

if (-not $NoSync) {
    & $syncScript
    if (-not $?) { exit 1 }
}

if ([string]::IsNullOrWhiteSpace($TillerExecutable)) {
    $TillerExecutable = Join-Path $TillerRoot 'target\debug\tiller.exe'
}

if (-not (Test-Path -LiteralPath $TillerExecutable -PathType Leaf)) {
    throw "Tiller executable not found: $TillerExecutable. Build it once in '$TillerRoot' or pass -TillerExecutable."
}

if (-not (Test-Path -LiteralPath (Join-Path $TillerRoot 'Cargo.toml'))) {
    throw "Tiller checkout not found: $TillerRoot"
}

if (Test-Path -LiteralPath $siteDirectory) {
    Remove-Item -LiteralPath $siteDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $siteDirectory -Force | Out-Null
& $TillerExecutable `
    --indir $repoRoot `
    --outdir $siteDirectory `
    --dev
exit $LASTEXITCODE
