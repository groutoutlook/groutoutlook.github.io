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
$cache = Join-Path $root '.tiller-build.sha256'
if (!(Test-Path (Join-Path $root 'tils') -PathType Container)) { throw 'TIL source directory not found.' }
if ([string]::IsNullOrWhiteSpace($TillerExecutable)) { $TillerExecutable = Join-Path $TillerRoot 'target\release\tiller.exe' }
if (!(Test-Path $TillerExecutable -PathType Leaf)) { throw "Tiller executable not found: $TillerExecutable" }

$manifest = [Text.StringBuilder]::new()
[void]$manifest.AppendLine((Get-FileHash $TillerExecutable).Hash)
Get-ChildItem $root -File -Recurse | Where-Object {
    $_.FullName -notlike "$site\*" -and $_.FullName -notlike "$root\.git\*" -and $_.FullName -ne $cache
} | Sort-Object FullName | ForEach-Object {
    [void]$manifest.AppendLine("$([IO.Path]::GetRelativePath($root, $_.FullName))=$((Get-FileHash $_.FullName).Hash)")
}
$fingerprint = [Convert]::ToHexString(([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($manifest.ToString()))))
if (!$Force -and (Test-Path $cache) -and (Test-Path (Join-Path $site 'index.html')) -and (Get-Content $cache -Raw).Trim() -eq $fingerprint) {
    Write-Host 'Site is up to date; skipping build.'
    exit 0
}

New-Item $site -ItemType Directory -Force | Out-Null
& $TillerExecutable --indir $root --outdir $site --dev
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Set-Content -LiteralPath $cache -Value $fingerprint -NoNewline
