shebang := if os() == 'windows' { 'pwsh.exe' } else { '/usr/bin/env pwsh' }
set shell := ["pwsh", "-c"]
set windows-shell := ["pwsh.exe", "-NoLogo", "-Command"]
set dotenv-load := true
# INFO: really dont want to meddle with the .env, direnv is also related to this.
# WARN: should have get them in .gitignore.
set dotenv-filename	:= ".env"
set unstable
# set dotenv-required := true
export JUST_ENV := "just_env" # WARN: this is also a method to export env var. 
_default:
    @just --list

alias b := build
build: 
    # nothing yet.

alias fmt := format
format args="nothing":
    # format something as `biome format --write`

# INFO: basic `run` recipe.
alias r := run
default_args := 'args here'
run args=default_args:
    @Write-Host {{default_args}} -ForegroundColor Red

var_test := "test format"
alias t := test
test:
    #not yet.
