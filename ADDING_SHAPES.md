# Adding a New Shape

This guide walks through adding a new shape to Letter Icon Composer. Only one file needs editing — `core.js` — and the UI, CLI, and modifier system pick it up automatically.

## 1. Add the shape entry to `SHAPES` in `core.js`

Add a new key to the `SHAPES` object. Place it in the **Official** section (if derived from JetBrains expUI icons) or the **Custom** section.

### Minimal example — `circle`

```js
circle: {
  official: true,
  label: 'Circle',
  preview: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1"/>',
  generate: (fill, stroke, sw, c) =>
    `<circle cx="${c}" cy="${c}" r="${c - 1 - sw/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
},
```

### Complex example — `diamond` (custom viewBoxSize + targetHeight)

```js
diamond: {
  official: true,
  label: 'Diamond',
  viewBoxSize: 18,
  targetHeight: 6.3,
  preview: '<rect x="4.13" y="4.13" width="9.75" height="9.75" rx="0.5" transform="rotate(45 9 9)" fill="none" stroke="currentColor" stroke-width="1"/>',
  generate: (fill, stroke, sw, c) => {
    const halfDiag = c - 1 - sw/2;
    const side = Math.round(halfDiag * Math.SQRT2 * 100) / 100;
    const offset = Math.round((c - side/2) * 100) / 100;
    return `<rect x="${offset}" y="${offset}" width="${side}" height="${side}" rx="0.5" transform="rotate(45 ${c} ${c})" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  },
},
```

### `generate()` parameters

| Parameter | Description |
|-----------|-------------|
| `fill`    | Shape fill color (e.g. `#E7EFFD`) |
| `stroke`  | Shape stroke color (e.g. `#3574F0`) |
| `sw`      | Stroke width in SVG units (typically `1`) |
| `c`       | Center coordinate = `viewBoxSize / 2` (default `8` for 16×16) |

The function returns an SVG markup string (one or more elements). All coordinates should account for:

- **1px transparent border**: shape content spans from `1` to `viewBoxSize - 1`, so use `c - 1` as the max extent from center.
- **Stroke centering**: strokes are centered on the path edge, so inset by an additional `sw/2` to keep the stroke inside the border.

## 2. Add a content-fit constraint to `contentFitScale()`

The `contentFitScale()` function in `core.js` prevents multi-character text from overflowing the shape interior. If your shape has a non-rectangular interior, add a case for it.

### Constraint patterns

The function already handles three geometry types:

**Circular (L2 norm)** — circle, dashed-circle:
```js
// text diagonal must fit within radius
const r = (c - 1 - esw) * sc - pad - Math.sqrt(xOffset ** 2 + yOffset ** 2);
const diag = Math.sqrt(halfW * halfW + halfH * halfH);
if (diag > r) scale = r / diag;
```

**Diamond (L1 norm)** — diamond, rounded-diamond:
```js
// halfW + halfH must fit within diagonal extent
const d = (c - 1 - esw) * sc - pad - Math.abs(xOffset) - Math.abs(yOffset);
const l1 = halfW + halfH;
if (l1 > d) scale = d / l1;
```

**Rectangular** — individual cases for shield, hexagon, document, composite, plus a fallback for roundrect/dashed-rect:
```js
// fit text box within available half-width and half-height
const hW = (availableHalfWidth - esw / 2) * sc - pad - Math.abs(xOffset);
const hH = (availableHalfHeight - esw / 2) * sc - pad - Math.abs(yOffset);
const sx = halfW > hW ? hW / halfW : 1;
const sy = halfH > hH ? hH / halfH : 1;
scale = Math.min(sx, sy);
```

### What to do

- **Rectangular interior**: If your shape's text area is a simple rectangle (possibly with rounded corners), add an `else if` case with the appropriate half-width and half-height values.
- **Non-rectangular interior** (circular, diamond, etc.): Add an `else if` with the appropriate norm calculation.
- **Falls through to default**: If your shape matches the `roundrect`/`dashed-rect` geometry (content area = `c - 1.5 - esw` in each direction), you don't need to add anything — the `else` branch handles it.

## 3. No changes needed in other files

The rest of the system is data-driven:

- **UI** (`index.html`): `buildShapes()` iterates `Object.entries(SHAPES)` and creates buttons automatically. Official shapes appear first; custom shapes appear after a "Custom" divider.
- **CLI** (`cli.js`): The `--shape` flag validates against `SHAPES`, and `--list shapes` enumerates it. Both use `Object.keys(SHAPES)` dynamically.
- **Modifier** (`modifier.js`): Shape-agnostic — it operates on the final SVG output regardless of which shape produced it.

## 4. Property reference

| Property | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | *(required)* | Display name shown in the UI and CLI |
| `preview` | `string` | *(required)* | SVG markup for the shape picker thumbnail (see conventions below) |
| `generate` | `function` | *(required)* | `(fill, stroke, sw, c) => string` — returns SVG element(s) |
| `official` | `boolean` | `false` | `true` for JetBrains expUI shapes (sorted first in the UI) |
| `viewBoxSize` | `number` | `16` | Native viewBox dimension (square); use `18` for larger shapes like diamond |
| `targetHeight` | `number` | `7.0` | Default cap-height for font calibration in SVG units |
| `defaultScale` | `number` | `1.0` | Default shape scale factor |
| `defaultXOffset` | `number` | `0` | Default horizontal letter offset (e.g. `-1.5` for composite) |
| `defaultYOffset` | `number` | `0` | Default vertical letter offset (e.g. `1.5` for composite) |

## 5. Conventions and tips

- **Preview SVG** uses the shape's `viewBoxSize` (default 16×16). Use `stroke="currentColor"` and `fill="none"` so it adapts to the UI theme.
- **`generate()`** should account for the 1px transparent border margin (`c - 1`) and stroke centering (`sw/2`).
- Use `Math.round(... * 100) / 100` for clean coordinate output (avoids long decimals in SVG path data).
- **Test with multi-character input** (e.g. "ABC") to verify your `contentFitScale()` constraint keeps text inside the shape.
- Dashed shapes set `effectiveSW = 1` in `contentFitScale()` regardless of the actual stroke width — follow this convention if your shape uses stroke-dasharray.
