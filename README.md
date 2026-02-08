# Letter Icon Composer

A browser-based tool and CLI for generating IntelliJ-style letter-on-shape SVG icons.

**https://davidseptimus.github.io/letter-icon-composer/**

## Background

IntelliJ language plugins require 16x16 SVG icons for PSI elements, file types, structure view nodes, and completion items. JetBrains expUI represents these as single- or multi-letter glyphs centered on geometric shapes (circles, rounded rectangles, diamonds, shields, etc.) using a defined color palette with separate light and dark theme variants.

Producing these icons manually in a vector graphics editor means converting text to paths, sizing and centering the glyph on a background shape, applying the correct theme colors, exporting, and repeating the whole process for the dark variant. This is manageable for a few icons but becomes tedious when a plugin needs dozens across multiple element types.

This tool generates both theme variants from a letter, shape, and color selection.

## Intended Audience

IntelliJ plugin developers building custom language support who need icons consistent with JetBrains expUI conventions.

## How It Works

1. [opentype.js](https://opentype.js.org) parses a font file and converts glyphs into SVG path data
2. The letter path is composited onto the selected background shape with the appropriate theme colors
3. If a badge SVG is provided, a corner notch is cut from the shape and the badge is uniformly scaled into the freed area ([Paper.js](http://paperjs.org) boolean subtraction for simple shapes, clipPath fallback for complex paths)
4. [SVGO](https://svgo.dev) optimizes the final SVG using the same configuration as the [Sketch SVGO Compressor plugin](https://www.sketchapp.com/extensions/plugins/svgo-compressor/), which is the [recommended method](https://plugins.jetbrains.com/docs/intellij/icons.html) for optimizing icons per the JetBrains platform guidelines
5. Light and dark theme variants are produced together

```mermaid
flowchart LR
    A[Font File] --> B(opentype.js)
    B --> C[\SVG Path/]
    C --> D{Compose}
    D --> E{Badge?}
    E -- yes --> F[\Badge SVG/]
    F --> G(Notch + Fit)
    G --> H(SVGO)
    E -- no --> H
    H --> I((Icon))
```

## Features

- 10 background shapes (6 from JetBrains expUI, 4 custom): circle, rounded rect, diamond, rounded diamond, shield, dashed circle, dashed rect, hexagon, document, composite
- 9 color presets: blue, orange, purple, red, green, amber (JetBrains official), grey, teal, pink
- Custom color overrides per theme variant
- Font selection: Open Sans (default), Inter, Google Fonts, or local .ttf/.otf/.woff files
- Optional badge overlay: import any SVG as a corner badge (drag-drop, paste, or file picker) with adjustable notch size, position, and scale
- Fine-tuning: font size, x/y offset, stroke width, shape scale
- Optional SVGO optimization with file size display
- CLI for scripting and batch generation (`--badge-svg` for badge overlay)

## Usage

### Browser

Open `index.html` in a browser or serve the directory locally (`npx serve .`). All processing runs client-side.

### CLI

```bash
npm install

# Blue circle "N" icon
node cli.js -l N -s circle -c blue -o ./icons/

# Purple hexagon with custom filename
node cli.js -l E -s hexagon -c purple -n element -o ./icons/

# Inter font, bold
node cli.js -l R -s document -c blue --font inter --bold -o ./icons/

# Output to stdout
node cli.js -l A -s shield -c green --stdout

# List available presets or shapes
node cli.js --list presets
node cli.js --list shapes
```

Run `node cli.js --help` for all options.

### Text-to-SVG (letter badges)

The `text-to-svg` subcommand converts text to SVG `<path>` elements, useful for creating letter badges that can be fed back into the main tool via `--badge-svg`.

```bash
# Generate a bold "N" letter badge
node cli.js text-to-svg -t "N" --bold -o badge.svg

# Multi-character badge with tight bounding box
node cli.js text-to-svg -t "Ab" --tight --color "#3574F0"

# Compose: letter badge on a circle icon
node cli.js text-to-svg -t "N" --bold --color "#3574F0" -o /tmp/badge.svg
node cli.js -l E -s circle -c blue --badge-svg /tmp/badge.svg -o ./icons/
```

Run `node cli.js text-to-svg --help` for all options.

## Output

Each invocation produces two files:

- `<name>.svg` — light theme variant
- `<name>_dark.svg` — dark theme variant

The `_dark` suffix follows the IntelliJ convention for automatic theme-based icon resolution.

## License

Apache 2.0. See [LICENSE](LICENSE).
