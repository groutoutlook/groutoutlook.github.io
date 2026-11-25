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
The Pages build job runs the assembler and uploads `public/`. The deploy job
starts after the build job finishes so GitHub has time to register the
`github-pages` artifact. If artifact lookup fails after a successful build,
rerun only the failed deploy job to reuse the upload.
The shared green microchip favicon is in `assets/site/` and is added to the
card, blog, map, and other browser views during assembly.

`rlo` runs `just pub` for the daily blog publish and `just card-publish` on
later runs that day. Both use the existing card snapshot; neither fetches the
private card repo nor installs packages nor compiles Rust/WASM.
`rlo -Force` bypasses the daily blog check and calls `just pub-force`, which
forces a blog rebuild and regenerates the journal weaves. Card updates are explicit:
run `just card-import` to fetch/build/import, then `just card-publish` to
publish the imported files.
The card-only path keeps successful build details quiet and prints the site URI
as its final line, including when there are no card changes.

Verified 2026-11-11: `node --test tests/site.test.mjs tests/card.test.mjs`
passed all eight tests, including publishing without card source configuration.
`just assemble` generated `public/` with 14,636 blog pages. Publishing recipes
were checked with `just --dry-run pub` and `just --dry-run card-publish`;
no live publish was run. Explicit card imports still encounter the upstream
packager's “Could not inline the interactive browser assets” template error.

Card source and ref are configured in `card.config.json`. By default, syncing
fetches the latest commit on the private repo's default branch. Push changes
to the card repo, then run `just card-import`; tags and GitHub Releases are not required.
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
by normal publishing or `just card-import`.

The **Package card browser snapshot** Actions workflow produces `card-web.zip`
from the checked-in snapshot. It can be downloaded and imported elsewhere;
it does not rebuild Rust or publish a GitHub Release. To create the same ZIP
locally on Windows:

```powershell
New-Item artifacts -ItemType Directory -Force
Compress-Archive -Path assets/card/* -DestinationPath artifacts/card-web.zip -Force
```

`just build` / `just rebuild` run Tiller against the configured journals and
assemble the complete site with the existing card snapshot. The snapshot
includes the self-contained interactive HTML and matching multi-file browser
host. If an older `public/` has no build marker, it is preserved under
`.cache/public-backup-*/public` before the new output is created. Unmarked
custom output directories are still refused.
Tiller uses `/blog/` rather than overriding
the base URL with `--dev`. Existing generated pages with root URLs are also
supported, so assembling alone does not require a full journal rebuild.

The blog links to **Journal tag weaves** on `/blog/visualizations/`. Each
configured journal with published tagged entries gets a page. Glyphweave
spells the canonical master tag from `~/hw/dot/config/jrnl/master-tags.toml`
using that journal's own tags. The page shows how many entries used each
tag, counting a tag once per entry across heading and body tags. The
visualizations page also includes a calendar of published posts.

`just rebuild` and `rlo -Force` run Glyphweave after Tiller and write light and
dark SVGs and the tag counts to `site/journal-weaves/`. Daily builds and Pages
assembly reuse those files. To regenerate from the existing Tiller snapshot,
run `node scripts/build-topic-cloud.mjs`.
`GLYPHWEAVE_EXE`, `GLYPHWEAVE_FONT`, and `JRNL_MASTER_TAGS` can override the local
executable, font, and dictionary paths.
The blog header reads **Blog**, with Home and Map links on every entry.
Open `/share-preview.html` after `just dev` to see the card's share image and
download its vCard or JSContact. Paste a `/blog/post/.../` URL into that preview to inspect
one blog entry. Open the downloaded `.vcf` in Contacts to review its fields.
Edit the card project's `profile.toml` for identity, exact wording, links, and
optional contact details. Rebuild with `just wasm-stage`, then import that
local card project here. The generated `card.profile.json` supplies the blog
intro and share-image text; do not edit the generated JSON.

The card uses the **tcard** Rust library to serialize vCard 4.0. **JSContact**
(RFC 9553) is a separate JSON export from the same TOML profile. Both downloads
are available in Export and `/share-preview.html`; the latter also displays
raw fields. The masked phone placeholder is omitted from contact exports.

The card's Rust/WASM renderer prepares matching 1200×630 share images at build
time. The assembler points crawlers at PNGs hosted on this website, avoiding an
OGIS dependency for prepared images. **OGIS** remains a generic HTTP fallback
when no prepared image exists, and is used by the PowerShell `ogp -Generate`
command. `OGIS_BASE_URL` selects a hosted or local endpoint.

Prepare the shared blog cover and selected post covers after card changes:

```powershell
node scripts/prepare-share-images.mjs post/gephi-open-graph-viz-platform
just dev
ogp http://127.0.0.1:1337/
ogp http://127.0.0.1:1337/blog/ -PassThru
```

Preparation uses the owning card checkout (`CARD_PROJECT` overrides its path),
reads the existing blog snapshot, and generates only the common cover plus
explicitly named posts. It does not regenerate journals. Other blog pages keep
their page metadata and use the common cover. The profile's exact wording is
preserved; no handle is added as share-image branding.

`ogp` is website-agnostic and displays images through `imgcat` by default.
Use `-Browser`, `-OutFile preview.png`, or `-PassThru` for other outputs;
`-Generate` explicitly requests OGIS even when a page already has an image.
No public tunnel is needed for this local inspection. Social services need a
published page and may cache old previews.

`just dev` assembles image URLs for its localhost port. `just assemble` and
publishing use the public domain by default; `SITE_URL` / `--site-url` override
it for other hosts. Reassemble with the production URL before deployment.
Desktop blog pages grow to about 63vw, capped at 1200px; mobile keeps its existing
layout. The CSS lives in Tiller's `assets/static/style.css` and the checked-in
`site/style.css` snapshot. Rebuild Tiller after changing its embedded CSS.
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

## Local journal calendars

The private exporter reads `jrnl` JSON. It runs separately from the blog build
and can export a single journal or a date range. Keep its output outside the
published `site/` directory. The public blacklist applies to the Tiller build.

```powershell
$cache = Join-Path $env:LOCALAPPDATA 'jrnl'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
node scripts/export-jrnl-calendar.mjs vc --kind event --output (Join-Path $cache 'vc-events.ics')
node scripts/export-jrnl-calendar.mjs vc --directory (Join-Path $cache 'vc-caldav')
```

Point Carl’s `[[ical]]` `file` setting at `vc-events.ics` and use `carl --agenda`.
It highlights journal days and shows entry titles. The second command creates a
new directory with one `VJOURNAL` resource per entry for CalDAV. Use the generated
filename as its resource ID when writing to Radicale with `calendula caldav put`.
Re-export to a new directory for a fresh snapshot. For entries with no `jrnl`
UUID, the ID comes from the journal alias and timestamp, plus the entry’s
position among entries sharing that minute.
