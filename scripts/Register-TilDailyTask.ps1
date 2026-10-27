[CmdletBinding()]
param(
    [string] $TaskName = 'Tiller TIL site',
    [datetime] $At = (Get-Date).Date.AddHours(3),
    [switch] $Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Invoke-TilSite.ps1'
$pwsh = (Get-Command pwsh -ErrorAction Stop).Source

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    return
}

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description 'Rebuild the Tiller site from configured journals.' -Force | Out-Null
Write-Host "Registered '$TaskName' at $($At.ToString('HH:mm')) daily"
