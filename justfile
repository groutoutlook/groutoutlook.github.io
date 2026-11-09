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

# Show available commands when no recipe is selected.
_default:
    @just --list

alias b := build
alias rb := rebuild
build:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Invoke-TilSite.ps1"

rebuild:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Invoke-TilSite.ps1" -Force

# Assemble the checked-in blog and card without reading the journals.
assemble:
    node "{{justfile_directory()}}/scripts/build-site.mjs"

# Fetch/build the latest committed card, or import an explicit dist directory.
card-import source="":
    node "{{justfile_directory()}}/scripts/sync-card.mjs" "{{source}}"

# Update and publish the card without rebuilding the journals.
card-publish:
    node "{{justfile_directory()}}/scripts/sync-card.mjs" --publish

# Download only final browser files from an authenticated private release.
card-release tag="latest" repo="groutoutlook/card":
    node "{{justfile_directory()}}/scripts/import-card-release.mjs" "{{tag}}" "{{repo}}"

dev port="1337": assemble
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Start-TilPreview.ps1" -Port {{port}}

dev-stop port="1337":
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Stop-TilPreview.ps1" -Port {{port}}

daily:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Register-TilDailyTask.ps1"

scan:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Invoke-SecretScan.ps1"

test:
    node --test tests/site.test.mjs tests/card.test.mjs

hooks:
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Install-GitHooks.ps1"

pub: card-import build
    pwsh -NoProfile -File "{{justfile_directory()}}/scripts/Publish-TilSite.ps1"
