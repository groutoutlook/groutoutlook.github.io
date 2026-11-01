[CmdletBinding()]
param(
    [string]$TillerRoot = 'D:\ProgramDataD\MiscLang\07.02-Rust\nightly\tiller',
    [string]$TillerExecutable,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'site'
if (!(Test-Path (Join-Path $root 'tils') -PathType Container)) { throw 'TIL source directory not found.' }
if ([string]::IsNullOrWhiteSpace($TillerExecutable)) { $TillerExecutable = Join-Path $TillerRoot 'target\release\tiller.exe' }
if (!(Test-Path $TillerExecutable -PathType Leaf)) { throw "Tiller executable not found: $TillerExecutable" }

$tillerArgs = @('--indir', $root, '--outdir', $site, '--dev')
if ($Force) { $tillerArgs += '--force' }
& $TillerExecutable @tillerArgs
exit $LASTEXITCODE
