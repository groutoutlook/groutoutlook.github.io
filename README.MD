# Public sites
- Every bootstrap scripts must fit in 20 lines. No blank line is better.
  - Reason: It fits my terminal.

The landing page is the card project's browser build. The existing TILs are
served as **Blog** at `/blog/`; `/map/` links to both, the interactive WASM demo,
the render-mode preview, and the feed.

```powershell
just                # List recipes; never builds anything
just card-import    # Fetch/build/import the latest card commit; no release needed
just assemble       # Assemble public/ from the existing blog and card files
just dev            # Assemble and preview at http://127.0.0.1:1337/
just test           # Check card syncing, publishing, routes, and favicons
```

`site/` stays the generated Tiller blog. `assets/card/` is a portable browser
snapshot; `public/` is the assembled Pages output and is ignored by Git.
GitHub Pages runs the assembler before uploading `public/`.
The shared green microchip favicon is in `assets/site/` and is added to the
card, blog, map, and other browser views during assembly.

`rlo` now checks the latest committed card on every run. When the daily blog
publish is due, it runs `just pub`: sync the card, regenerate the blog, assemble
the site, and commit/push the blog and card assets. If the blog was already
published today, it runs `just card-publish`: sync and publish card changes
without rebuilding the journals. `rlo -Force` still bypasses the daily blog
check. An unchanged card commit does not trigger another card build or commit.

Card source and ref are configured in `card.config.json`. By default, syncing
fetches the latest commit on the private repo's default branch. Push changes
to the card repo, then run `rlo`; tags and GitHub Releases are not required.
Git uses your existing GitHub credentials. The private checkout, npm packages,
and Rust build cache stay under ignored `.cache/card/`; only browser files
are imported into `assets/card/` and published. Your working card repo is
not modified, and its uncommitted edits are not imported by this workflow.

To update and preview the card without publishing:

```powershell
just card-import
just dev
```

The first sync requires Git, stable Rust/rustup, the WASM target, and Node/npm.
It installs the WASM target, builds the committed source, and generates the
PNG/GIF exports, including portrait variants when supported. Later syncs
rebuild only when the upstream commit or imported files have changed.

An explicit local project, `dist` directory, or extracted browser archive is
still supported for testing local builds:

```powershell
just card-import 'D:\ProgramDataD\MiscLang\07.02-Rust\proj\card'
just assemble
```

The importer validates WASM and referenced browser assets before replacing
the snapshot. `assets/card/build.json` records the commit, local-change status,
import time, and checksums. Identical imports preserve that file unchanged.
Failed builds keep the last working imported card. `just card-publish` commits
only card assets, leaving pending blog edits for the daily publish.

GitHub Pages consumes the checked-in browser files; it needs no private-repo
token or source checkout. The optional `just card-release <tag>` recipe still
accepts a `card-web.zip` from a GitHub Release if one exists; it is not used
by `rlo` or `just card-import`.

The **Package card browser snapshot** Actions workflow produces `card-web.zip`
from the checked-in snapshot. It can be downloaded and imported elsewhere;
it does not rebuild Rust or publish a GitHub Release. To create the same ZIP
locally on Windows:

```powershell
New-Item artifacts -ItemType Directory -Force
Compress-Archive -Path assets/card/* -DestinationPath artifacts/card-web.zip -Force
```

`just build` / `just rebuild` first import the latest committed card, then run
Tiller against the configured journals and assemble the complete site. The
import includes bundled fonts and their licenses. If an older `public/` has no
build marker, it is preserved under `.cache/public-backup-*/public` before the
new output is created. Unmarked custom output directories are still refused.
Tiller uses `/blog/` rather than overriding
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
