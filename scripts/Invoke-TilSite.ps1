[CmdletBinding()]
param(
    [string] $TillerRoot = 'D:\ProgramDataD\MiscLang\07.02-Rust\nightly\tiller',
    [string] $TillerExecutable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$siteDirectory = Join-Path $repoRoot 'site'

$tilsDirectory = Join-Path $repoRoot 'tils'
if (-not (Test-Path -LiteralPath $tilsDirectory -PathType Container)) {
    throw "TIL source directory not found: $tilsDirectory"
}

if ([string]::IsNullOrWhiteSpace($TillerExecutable)) {
    $TillerExecutable = Join-Path $TillerRoot 'target\release\tiller.exe'
}

if (-not (Test-Path -LiteralPath $TillerExecutable -PathType Leaf)) {
    throw "Tiller executable not found: $TillerExecutable. Build it once in '$TillerRoot' or pass -TillerExecutable."
}

if (-not (Test-Path -LiteralPath (Join-Path $TillerRoot 'Cargo.toml'))) {
    throw "Tiller checkout not found: $TillerRoot"
}

New-Item -ItemType Directory -Path $siteDirectory -Force | Out-Null
& $TillerExecutable `
    --indir $repoRoot `
    --outdir $siteDirectory `
    --dev
exit $LASTEXITCODE
