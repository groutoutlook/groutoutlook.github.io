# Terminal font

The interactive browser host bundles DejaVu Sans Mono 2.35, regular and bold,
so text and box-drawing characters use the same fixed-width metrics on phones
and desktop computers. Both faces are served locally; no font service is used.

The WOFF2 files retain the complete glyph sets and license metadata of the
upstream TTF files. They were converted with `fontTools.ttLib.TTFont` by setting
`font.flavor = "woff2"` and saving with Brotli compression. See `LICENSE.txt`
for the font license.
