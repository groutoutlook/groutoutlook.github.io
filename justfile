shebang := if os() == 'windows' { 'pwsh.exe' } else { '/usr/bin/env pwsh' }
set shell := ["nu", "-c"]
set windows-shell := ["pwsh.exe", "-NoLogo", "-NoProfile","-Command"]
set dotenv-load := true
set script-interpreter := ["pwsh.exe", "-NoLogo", "-NoProfile","-Command"]
set dotenv-filename	:= ".env"
set unstable
set fallback
set lists

# set dotenv-required := true

    
set windows-powershell := true

alias b := build
alias rb := rebuild
build:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Invoke-TilSite.ps1"

rebuild: build

dev port="1337": build
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Start-TilPreview.ps1" -Port {{port}}

dev-stop port="1337":
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Stop-TilPreview.ps1" -Port {{port}}

daily:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Register-TilDailyTask.ps1"

scan:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Invoke-SecretScan.ps1"

hooks:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Install-GitHooks.ps1"

pub: build
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Publish-TilSite.ps1"
