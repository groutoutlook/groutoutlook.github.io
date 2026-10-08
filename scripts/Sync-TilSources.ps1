[CmdletBinding()]
param(
    [string] $JrnlConfig = 'C:\Users\COHOTECH\hw\dot\config\jrnl\jrnl.yaml',
    [string[]] $JournalNames = @('til', 'misc', 'technologia', 'blog'),
    [string] $LinkDirectory = ''
)

Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($LinkDirectory)) {
    $LinkDirectory = Join-Path $repoRoot 'tils'
}

if (-not (Test-Path -LiteralPath $JrnlConfig -PathType Leaf)) {
    throw "jrnl config not found: $JrnlConfig"
}

New-Item -ItemType Directory -Path $LinkDirectory -Force -ErrorAction Stop | Out-Null
Get-ChildItem -LiteralPath $LinkDirectory -Force -ErrorAction Stop | Remove-Item -Force -Recurse -ErrorAction Stop

$configLines = Get-Content -LiteralPath $JrnlConfig
$configured = @{}
$currentName = $null
foreach ($line in $configLines) {
    if ($line -match '^  ([A-Za-z0-9_-]+):\s*$') {
        $currentName = $Matches[1]
        continue
    }

    if ($null -ne $currentName -and $line -match '^\s+journal:\s+(.+?)\s*$') {
        $configured[$currentName] = $Matches[1].Trim()
        $currentName = $null
    }
}

$sources = foreach ($name in $JournalNames) {
    if (-not $configured.ContainsKey($name)) {
        throw "Journal alias '$name' is not configured in $JrnlConfig"
    }

    $path = $configured[$name]
    if ($path -like '~*') {
        $path = Join-Path $HOME $path.Substring(2)
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Journal file for '$name' not found: $path"
    }
    Get-Item -LiteralPath $path
}

$sources = @($sources | Sort-Object FullName -Unique)

foreach ($source in $sources) {
    $name = $source.Name
    $linkPath = Join-Path $LinkDirectory $name
    New-Item -ItemType SymbolicLink -Path $linkPath -Target $source.FullName -ErrorAction Stop | Out-Null
}

Write-Host "Mapped $($sources.Count) configured journal files to $LinkDirectory"
