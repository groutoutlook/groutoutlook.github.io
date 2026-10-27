[CmdletBinding()]
param(
    [switch] $All
)

Set-StrictMode -Version Latest
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
    if ($null -ne $gitleaks) {
        if ($All) {
            & $gitleaks.Source git --redact --no-banner
        } else {
            & $gitleaks.Source protect --staged --redact --no-banner
        }
        exit $LASTEXITCODE
    }

    Write-Warning 'gitleaks is not installed; running the built-in high-signal staged check.'
    $diff = git diff --cached --no-ext-diff --unified=0 -- . ':!site' ':!tils'
    $patterns = @(
        '(?i)AKIA[0-9A-Z]{16}',
        '(?i)gh[pousr]_[A-Za-z0-9_]{20,}',
        '(?i)-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----',
        '(?i)(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'']?[^\s"'']{12,}'
    )
    foreach ($pattern in $patterns) {
        if ($diff -match $pattern) {
            Write-Error "Possible secret detected in staged changes: $($Matches[0])"
            exit 1
        }
    }
    Write-Host 'No high-signal secrets found in staged changes.'
    exit 0
} finally {
    Pop-Location
}
