---
name: letter-icon-composer
description: |
  Generate SVG icons with the letter-icon-composer CLI: $ARGUMENTS
  Use this skill when the user asks to create, compose, or batch-generate letter icons,
  badged icons, or letter badges via the CLI. Covers letter mode, custom shapes, badge
  composer (--base-icon), the text-to-svg subcommand, and light/dark variant output.
---

# Letter Icon Composer Skill

This skill drives the letter-icon-composer CLI (`cli.js`) to generate SVG icons that
follow the JetBrains icon style: circle / rounded-rect / diamond / shield / etc.
backgrounds with letter glyphs rendered from real font outlines, optionally composited
with overlay badges that punch cutouts through the base.

It also supports a "badge composer" mode that imports an arbitrary SVG and applies
badge overlays to it — useful when you have an existing icon and just need to add a
small indicator.

## When to use

- User wants a single SVG icon (letter or letter-plus-badge) in JetBrains style
- User wants to add a badge overlay (letter or arbitrary SVG) to an existing icon
- User wants to discover what shapes / color presets / modifiers the CLI supports
- User wants to script batch icon generation

If the user asks for something the CLI cannot do (custom hand-drawn paths, non-SVG
output, raster conversion), hand-draw the SVG directly or pipeline through another
tool — don't force it through this CLI.

## Finding the CLI

The CLI script is `cli.js` at the root of the `letter-icon-composer` repo.
Invoke it with node:

```bash
node <path-to-repo>/cli.js --help
node <path-to-repo>/cli.js text-to-svg --help
```

If you don't know the repo location, ask the user or probe common locations
(`~/IdeaProjects/letter-icon-composer/cli.js`, `./cli.js`, `./node_modules/.bin/...`).
Once located, reuse the same path for every invocation in the session.

## Authoritative CLI reference

Always prefer the CLI's own `--help` and `--list` output over anything documented here,
since the CLI evolves. This section is a summary — run `--help` if you're unsure.

### Main command

```
Usage:
  node cli.js --letter <char> [options]
  node cli.js --base-icon <svg-file> [--badge-svg <file>] [options]

Required (letter mode):
  -l, --letter <char>      Letter(s) to render (e.g. N, Ab)

Modes:
  --custom-shape <file>    Use an imported SVG as the background shape (letter mode)
  --base-icon <file>       Badge composer — import an SVG icon and apply badge cutouts/overlays
                           (no letter, no recoloring; produces single file, not light/dark pair)

Shape & Color:
  -s, --shape <name>       Shape (default: circle). Run --list shapes for options.
  -c, --color <preset>     Color preset (default: blue). Run --list presets for options.
  --light-fill <hex>       Override light fill color
  --light-stroke <hex>     Override light stroke color (also the letter color unless --light-letter is set)
  --light-letter <hex>     Override light letter color (defaults to the light stroke color)
  --dark-fill <hex>        Override dark fill color
  --dark-stroke <hex>      Override dark stroke color (also the letter color unless --dark-letter is set)
  --dark-letter <hex>      Override dark letter color (defaults to the dark stroke color)

Font:
  -f, --font <key>         Built-in font: open-sans, inter (default: open-sans)
  --font-file <path>       Load a local .ttf/.otf/.woff file
  --google-font <name>     Load a Google Font by name (e.g. "Roboto")
  --font-weight <weight>   Google font weight: 400, 500, 600, 700 (default: 600)
  --font-subset <name>     Fontsource subset: latin, symbols, cyrillic, etc. (default: latin)
  --bold                   Use bold variant
  --italic                 Use italic variant

Fine Tuning:
  --font-size <n>          Font size in SVG units (auto-calibrated if omitted)
  --x-offset <n>           Horizontal offset (default: 0)
  --y-offset <n>           Vertical offset (default: 0)
  --stroke-width <n>       Shape stroke width (default: 1)
  --shape-scale <n>        Shape scale factor (default: per-shape or 1.0)

Modifier / Badge:
  -m, --modifier <name>    Badge modifier: none, custom (default: none)
  --badge-svg <file>       Custom SVG badge file(s) — repeatable, layered bottom to top
  --badge-x-offset <n>     Per-badge horizontal offset (repeatable, default: 0)
  --badge-y-offset <n>     Per-badge vertical offset (repeatable, default: 0)
  --badge-scale <n>        Per-badge scale factor (repeatable, default: 1.0)
  --badge-gap <n>          Per-badge gap around silhouette cutout (repeatable, default: 1)
  --badge-anchor <pos>     Per-badge anchor: tl, t, tr, l, c, r, bl, b, br (repeatable, default: br)
  --badge-trim <bool>      Per-badge viewBox trim: true|false (repeatable, default: true)
                           Tightens the badge's viewBox to its visible content before compositing.
  --fill-enclosed-regions <bool>
                           Treat each badge's outline as a solid cutout area (default: true),
                           even when the badge has hollow regions. Set to false to respect
                           intentional holes (donut, frame badges).
  --badge-fill-enclosed <bool>
                           Per-badge override of --fill-enclosed-regions (repeatable).
  --prefer-clip-path       Render the cutout with a clip-path group instead of boolean path
                           subtraction. Preserves the base icon's paths; use when subtraction
                           corrupts an icon.
  --target-size <px>       (--base-icon mode) Set the output SVG's width/height to <px>.
                           Common IDE sizes: 12, 16, 20, 24, 32, 40, 48. viewBox is preserved.

Output:
  -n, --name <name>        Base file name (default: derived from letter)
  -o, --out <dir>          Output directory (default: current directory)
  --light-only             Only generate light variant
  --dark-only              Only generate dark variant
  --stdout                 Print SVG to stdout instead of writing files

Batch / Introspection:
  --list <preset|shape|modifier>  List available presets, shapes, or modifiers and exit
```

By default (no `--light-only` / `--dark-only`), letter mode writes **two files**:
`<name>.svg` (light) and `<name>_dark.svg` (dark). Badge composer mode (`--base-icon`)
always writes a **single file** because it preserves the source SVG's colors.

### `text-to-svg` subcommand

Converts text to SVG `<path>` elements. Primary use case: making letter badges that
feed back into the main command via `--badge-svg`.

```
Usage:
  node cli.js text-to-svg --text <string> [options]

Required:
  -t, --text <string>      Text to convert to paths

Font:
  (same font options as main command: --font, --font-file, --google-font,
   --font-weight, --font-subset, --bold, --italic)

Sizing:
  --font-size <n>          Font size in SVG units (auto-fit to viewBox if omitted)
  --size <n>               ViewBox size — square (default: 16)
  --padding <n>            Padding around text in SVG units (default: 0)
  --tight                  Shrink-wrap viewBox to glyph bounding box

Output:
  --color <hex>            Fill color (default: #000000)
  -o, --out <file>         Write to file instead of stdout
```

## Discovering shapes, presets, and modifiers

```bash
node <path-to-repo>/cli.js --list shapes
node <path-to-repo>/cli.js --list presets
node <path-to-repo>/cli.js --list modifiers
```

These are authoritative. Run them before recommending a shape or preset if it's been a
while since you last checked. The tables below are a convenience snapshot.

### Built-in shapes

| Key               | Shape            | Source    |
|-------------------|------------------|-----------|
| `circle`          | Circle           | JetBrains |
| `roundrect`       | Rounded Rect     | JetBrains |
| `diamond`         | Diamond          | JetBrains |
| `rounded-diamond` | Rounded Diamond  | JetBrains |
| `shield`          | Shield           | JetBrains |
| `dashed-circle`   | Dashed Circle    | JetBrains |
| `dashed-rect`     | Dashed Rect      | JetBrains |
| `composite`       | Composite        | Custom    |
| `hexagon`         | Hexagon          | Custom    |
| `document`        | Document         | Custom    |

### Built-in color presets

All presets are tuned to the JetBrains IDE new-icon palette: soft tinted fill with a
saturated stroke on light, desaturated dark fill with a lighter stroke on dark.
Use these hex values when you need a badge color to match the icon's stroke
(e.g. recipe #3 below).

| Name   | Light Fill | Light Stroke | Dark Fill | Dark Stroke | Source    |
|--------|------------|--------------|-----------|-------------|-----------|
| Blue   | `#E7EFFD`  | `#3574F0`    | `#25324D` | `#548AF7`   | JetBrains |
| Orange | `#FFF4EB`  | `#E66D17`    | `#45322B` | `#C77D55`   | JetBrains |
| Purple | `#FAF5FF`  | `#834DF0`    | `#2F2936` | `#A571E6`   | JetBrains |
| Red    | `#FFF7F7`  | `#DB3B4B`    | `#402929` | `#DB5C5C`   | JetBrains |
| Green  | `#F2FCF3`  | `#208A3C`    | `#253627` | `#57965C`   | JetBrains |
| Amber  | `#FFFAEB`  | `#C27D04`    | `#3D3223` | `#D6AE58`   | JetBrains |
| Grey   | `#F0F0F0`  | `#757575`    | `#303030` | `#9E9E9E`   | Custom    |
| Teal   | `#E0F2F1`  | `#00796B`    | `#1A3230` | `#4DB6AC`   | Custom    |
| Pink   | `#FCE4EC`  | `#AD1457`    | `#3B2430` | `#F06292`   | Custom    |

## Badge anchor positions

The `--badge-anchor` option positions a badge at one of 9 points in the viewBox:

```
tl --- t --- tr
|      |      |
l --- c --- r
|      |      |
bl --- b --- br   (default: br)
```

The anchor aligns the badge's corresponding edge/center to the viewBox's matching
point. For example, `br` places the badge's bottom-right at the viewBox's bottom-right,
`tl` places the badge's top-left at the viewBox's top-left, and `c` centers it.

## Choosing a font

- Built-in `open-sans` (default) and `inter` ship with the CLI — no network needed.
- `--google-font "Roboto"` (or any Google Font) downloads the font on first use.
- `--font-file <path>` loads a local `.ttf` / `.otf` / `.woff`. This is the most
  predictable option for reproducible builds and for teams that want every icon to
  share a single font.
- `--bold`, `--italic`, `--font-weight <400|500|600|700>` pick a variant. Heavier
  weights read better at small sizes (16×16) where strokes collapse.

## Recipes

### 1. Basic letter icon (light + dark pair)

```bash
node cli.js -l N -s circle -c blue -o ./icons/
# Produces: ./icons/N.svg and ./icons/N_dark.svg
```

### 2. Letter icon with a custom name

```bash
node cli.js -l E -s hexagon -c purple --name element -o ./icons/
# Produces: ./icons/element.svg and ./icons/element_dark.svg
```

### 3. Letter icon with a **letter badge** overlay

Two-step: generate the badge SVG, then composite it onto the main icon. Generate the
badge once per color (light vs. dark stroke) so it matches the icon it's compositing onto.

```bash
# Light pass
node cli.js text-to-svg -t "N" --bold --color "#3574F0" -o /tmp/badge_light.svg
node cli.js -l E -s circle -c blue \
  --badge-svg /tmp/badge_light.svg --badge-anchor br \
  --light-only --name entityNode -o ./icons/

# Dark pass
node cli.js text-to-svg -t "N" --bold --color "#548AF7" -o /tmp/badge_dark.svg
node cli.js -l E -s circle -c blue \
  --badge-svg /tmp/badge_dark.svg --badge-anchor br \
  --dark-only --name entityNode -o ./icons/
```

### 4. Badge composer — add a badge to an existing icon

Single output file; the base icon's original colors are preserved.

```bash
node cli.js \
  --base-icon ./source/service.svg \
  --badge-svg ./badges/lock.svg \
  --badge-anchor br \
  --name serviceLocked -o ./icons/
```

### 5. Multiple badges layered bottom-to-top

Each per-badge option (`--badge-svg`, `--badge-anchor`, `--badge-x-offset`, etc.)
is repeatable and consumed positionally — the Nth value of each flag applies to the
Nth `--badge-svg`.

```bash
node cli.js \
  --base-icon ./source/service.svg \
  --badge-svg ./badges/lock.svg --badge-svg ./badges/star.svg \
  --badge-anchor br --badge-anchor tl \
  --name serviceLockedPrime -o ./icons/
```

### 6. Custom-shape icon (letter rendered onto an imported SVG shape)

```bash
node cli.js -l A \
  --custom-shape ./shapes/cloud.svg \
  -c blue -o ./icons/
```

### 7. Piping without touching disk

`--stdout` on the main command and omitting `-o` on `text-to-svg` both write to stdout,
so you can pipe badges directly into the main command via process substitution:

```bash
node cli.js -l E -s circle -c blue \
  --badge-svg <(node cli.js text-to-svg -t "N" --bold --color "#3574F0") \
  --stdout > entityNode.svg
```

### 8. Override colors

```bash
node cli.js -l X -s circle \
  --light-fill "#FFF" --light-stroke "#000" \
  --dark-fill "#111"  --dark-stroke "#FFF" \
  -o ./icons/
```

### 9. Only generate one variant

```bash
node cli.js -l N -s circle -c blue --light-only -o ./icons/
node cli.js -l N -s circle -c blue --dark-only  -o ./icons/
```

### 10. Target a specific IDE size in badge composer mode

```bash
node cli.js --base-icon ./source/service.svg \
  --badge-svg ./badges/lock.svg \
  --target-size 24 \
  -o ./icons/
```

## Troubleshooting

- **Badge looks misaligned**: try `--badge-trim true` (default) or set it false to
  keep the badge's original viewBox. Adjust `--badge-x-offset` / `--badge-y-offset`
  for fine tuning.
- **Badge cutout eats the wrong part of the base icon**: try `--prefer-clip-path`
  (badge composer mode). This switches from boolean path subtraction to a
  clip-path group.
- **Badge's hollow interior gets filled in**: set `--fill-enclosed-regions false`
  (global) or `--badge-fill-enclosed false` (per-badge). Useful for donut / frame
  badges where the hole is intentional.
- **Letter renders too small / large**: pass `--font-size <n>` explicitly (auto-
  calibration is a heuristic). For two-letter strings, start with a smaller value
  (e.g. 9) and adjust.
- **Stroke looks wrong at small sizes**: bump `--stroke-width`; `1` is the default
  for 16×16 icons.

## Operation reference

Parse the first argument to decide which operation to run. If the user gives a raw
CLI command, just pass it through to `node cli.js` verbatim.

### `create <name> [options]`
Generate a letter icon (light + dark pair by default).

Required: `--letter <char>`. Optional: `--shape`, `--color`, font options, `--out`,
plus any other CLI flag.

```bash
node cli.js -l <letter> -s <shape> -c <color> -n <name> -o <out-dir>
```

### `create-with-badge <name> [options]`
Generate a letter icon with a letter badge overlay. Produces light + dark pair. The
badge letter is rendered once per variant so its color matches the icon stroke.

Required: `--letter <char>`, `--badge-letter <char>`. Optional: `--badge-anchor`,
`--badge-bold`, `--badge-color` (defaults to icon stroke), plus any other CLI flag.

Follow recipe #3 above.

### `create-badged-icon <name> [options]`
Use badge composer mode to overlay a badge on an existing SVG. Single output file.

Required: `--base-icon <file>`, `--badge-svg <file>`. Optional: `--badge-anchor`,
`--badge-gap`, `--badge-trim`, `--badge-fill-enclosed`, `--prefer-clip-path`,
`--target-size`, plus any per-badge tuning flag (all repeatable).

Follow recipes #4 and #5 above.

### `discover`
Print the CLI's introspection output (shapes + presets + modifiers) so the user can
see what's available.

```bash
node cli.js --list shapes
node cli.js --list presets
node cli.js --list modifiers
```

## Notes for agents

- **One path per session.** Locate `cli.js` once, reuse the same absolute path for
  every subsequent invocation.
- **Run `--help` when unsure.** The flag list in this skill is a snapshot; the CLI
  itself is authoritative.
- **Badge composer mode is single-file.** Don't try to generate a dark variant by
  re-running with different color overrides — the base icon's colors pass through
  unchanged. If you need light + dark, run `create-badged-icon` twice with separate
  light / dark source SVGs and name them `<x>.svg` / `<x>_dark.svg`.
- **Letter mode always writes two files** unless `--light-only` or `--dark-only` is
  passed. Don't delete the `_dark` output assuming it's a duplicate.
- **Repeatable flags are positional.** The Nth `--badge-anchor` pairs with the Nth
  `--badge-svg`. If a per-badge flag is omitted for some badges, supply defaults for
  earlier ones so the positions stay aligned.
