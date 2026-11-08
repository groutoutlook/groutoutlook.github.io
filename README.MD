# Public sites
- Every bootstrap scripts must fit in 20 lines. No blank line is better.
  - Reason: It fits my terminal.

The landing page is the card project's browser build. The existing TILs are
served as **Blog** at `/blog/`; `/map/` links to both, the interactive WASM demo,
the render-mode preview, and the feed.

```powershell
just assemble       # Build public/ from the checked-in snapshots; no journal scan
just dev            # Assemble and preview at http://127.0.0.1:1337/
just test           # Check routes, links, RSS rebasing, and old-link redirects
```

`site/` stays the generated Tiller blog. `assets/card/` is a portable browser
snapshot; `public/` is the assembled Pages output and is ignored by Git.
GitHub Pages runs the assembler before uploading `public/`.
The shared green microchip favicon is in `assets/site/` and is added to the
card, blog, map, and other browser views during assembly.

Your shell's `rlo` command already follows the vault's daily publish script
into this repo's `just pub` recipe. That regenerates the blog and assembles
the complete site before publishing. The existing once-per-day check still
applies; `rlo -Force` bypasses that daily check. It does not import a new card
release. Use `just assemble` or `just dev` here for local site-only changes.

To refresh the card, first run `just wasm-stage` in the card project, then
generate any PNG/GIF files its exported pages link to. From this repo:

```powershell
just card-import 'D:\ProgramDataD\MiscLang\07.02-Rust\proj\card'
just assemble
```

The importer also accepts a `dist` directory or an extracted `card-web.zip`.
It validates the WASM and referenced browser assets before replacing the
snapshot. `assets/card/build.json` records the source commit, local-change
status, import time, and WASM checksum. The initial snapshot was built locally;
check its recorded local-change status when reproducing it.

The private card repo has a **Release browser card** workflow. A `web-v*` tag
builds the Rust/WASM engine, stages the browser app, generates PNG/GIF exports,
and attaches `card-web.zip` to the private GitHub Release. Manual workflow runs
produce an Actions artifact without creating a release. The `web-v` prefix
avoids the card repo's older `v*` npm release workflow.

After committing/pushing that workflow in the private card repo and creating
a `web-v*` release tag, import only its browser files here:

```powershell
gh auth login                    # If not already authenticated
just card-release web-v0.1.0      # Or: just card-release (latest release)
just assemble
```

This uses your local GitHub CLI authentication to download the private asset.
Commit `assets/card/` here to deploy; Pages needs no private-repo token,
submodule, or source checkout. No GitHub credentials go into browser files.
The release importer requires PowerShell 7 (`pwsh`) for ZIP extraction.

The **Package card browser snapshot** Actions workflow produces `card-web.zip`
from the checked-in snapshot. It can be downloaded and imported elsewhere;
it does not rebuild Rust or publish a GitHub Release. To create the same ZIP
locally on Windows:

```powershell
New-Item artifacts -ItemType Directory -Force
Compress-Archive -Path assets/card/* -DestinationPath artifacts/card-web.zip -Force
```

`just build` / `just rebuild` still run Tiller against the configured journals,
then assemble the complete site. Tiller uses `/blog/` rather than overriding
the base URL with `--dev`. Existing generated pages with root URLs are also
supported, so assembling alone does not require a full journal rebuild.
The blog header reads **Blog**, with Home and Map links on every entry.
Old `/post/`, `/category/`, `/subtag/`, and `/recent/` links redirect through
the Pages 404 page, preserving query strings and anchors; the old root RSS
URL continues to serve the feed. These HTML redirects require JavaScript.

For a future GitHub project site or another hosting subdirectory:

```powershell
node scripts/build-site.mjs --base-path /personal/
```

Serve the resulting `public/` directory at that path. The default base path
is `/`, so moving the repo or changing a domain does not require hard-coded
card or blog domain changes. Configure the same base path in the deploy build
command when using subdirectory hosting.
