#!/usr/bin/env node
/**
 * Letter Icon Composer — Node.js CLI
 *
 * Generates composite letter-on-shape SVG icons for IntelliJ structure & completion views.
 * Shares core logic with the browser UI (index.html) via core.js.
 *
 * Usage:
 *   node cli.js --letter N --shape circle --color blue --out ./icons/
 *   node cli.js -l E -s hexagon -c purple -o ./icons/ --name element
 *   node cli.js -l R -s document -c blue --font inter
 *
 * Run `node cli.js --help` for full options.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// opentype.js — loaded dynamically so we can give a helpful error
let opentype;
try {
  opentype = await import('opentype.js');
} catch {
  console.error('Missing dependency: opentype.js');
  console.error('Run: npm install    (from the icon-generator directory)');
  process.exit(1);
}

import { optimize } from 'svgo';

import {
  PRESETS,
  SHAPES,
  MODIFIERS,
  findPreset,
  getFontUrl,
  getGoogleFontUrl,
  calibrateFontSize,
  generateLetterPath,
  generateSVG,
} from './core.js';
import { createModifierEngine } from './modifier.js';

// ── Text-to-SVG Subcommand ──────────────────────────────────────────
if (process.argv[2] === 'text-to-svg') {
  const { values: ta } = parseArgs({
    args: process.argv.slice(3),
    options: {
      text:          { type: 'string', short: 't' },
      font:          { type: 'string', short: 'f', default: 'open-sans' },
      'font-file':   { type: 'string' },
      'google-font': { type: 'string' },
      'font-weight': { type: 'string', default: '600' },
      bold:          { type: 'boolean', default: false },
      italic:        { type: 'boolean', default: false },
      'font-size':   { type: 'string' },
      color:         { type: 'string', default: '#000000' },
      size:          { type: 'string', default: '16' },
      padding:       { type: 'string', default: '0' },
      tight:         { type: 'boolean', default: false },
      out:           { type: 'string', short: 'o' },
      help:          { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
  });

  if (ta.help) {
    console.log(`
Text to SVG Paths — Subcommand

Converts text to SVG <path> elements. Useful for creating letter badges
that can be fed back into the main tool via --badge-svg.

Usage:
  node cli.js text-to-svg --text <string> [options]

Required:
  -t, --text <string>      Text to convert to paths

Font:
  -f, --font <key>         Built-in font: open-sans, inter (default: open-sans)
  --font-file <path>       Load a local .ttf/.otf/.woff file
  --google-font <name>     Load a Google Font by name (e.g. "Roboto")
  --font-weight <weight>   Google font weight: 400, 500, 600, 700 (default: 600)
  --bold                   Use bold variant
  --italic                 Use italic variant

Sizing:
  --font-size <n>          Font size in SVG units (auto-fit to viewBox if omitted)
  --size <n>               ViewBox size — square (default: 16)
  --padding <n>            Padding around text in SVG units (default: 0)
  --tight                  Shrink-wrap viewBox to glyph bounding box

Output:
  --color <hex>            Fill color (default: #000000)
  -o, --out <file>         Write to file instead of stdout

Examples:
  node cli.js text-to-svg -t "N" --bold
  node cli.js text-to-svg -t "Ab" --font inter --size 16
  node cli.js text-to-svg -t "+" --tight --color "#3574F0"
  node cli.js text-to-svg -t "N" -o badge.svg
  node cli.js -l E -s circle -c blue --badge-svg <(node cli.js text-to-svg -t "N")
`);
    process.exit(0);
  }

  if (!ta.text) {
    console.error('Error: --text is required. Run "node cli.js text-to-svg --help" for usage.');
    process.exit(1);
  }

  // Load font (self-contained to avoid depending on main-flow args)
  async function loadTextFont() {
    if (ta['font-file']) {
      const buf = await readFile(resolve(ta['font-file']));
      return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }
    if (ta['google-font']) {
      const urls = getGoogleFontUrl(ta['google-font'], ta['font-weight'], ta.bold, ta.italic);
      for (const url of urls) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          return opentype.parse(await resp.arrayBuffer());
        } catch { /* try next subset */ }
      }
      console.error(`Error: Could not load Google Font "${ta['google-font']}". Check spelling.`);
      process.exit(1);
    }
    const url = getFontUrl(ta.font, ta.bold, ta.italic);
    if (!url) {
      console.error(`Error: Font "${ta.font}" does not have the requested variant (bold=${ta.bold}, italic=${ta.italic}).`);
      process.exit(1);
    }
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Error: Failed to download font from ${url}`);
      process.exit(1);
    }
    return opentype.parse(await resp.arrayBuffer());
  }

  const font = await loadTextFont();
  const vbSize = parseFloat(ta.size);
  const padding = parseFloat(ta.padding);
  const color = ta.color;
  const center = vbSize / 2;

  // Determine font size — auto-calibrate to fit viewBox if not specified
  let fontSize;
  if (ta['font-size']) {
    fontSize = parseFloat(ta['font-size']);
  } else {
    const targetH = vbSize - 2 * padding;
    fontSize = calibrateFontSize(font, ta.text, targetH);
    // Also bound horizontally so multi-char text fits
    const probe = font.getPath(ta.text, 0, 0, fontSize);
    const bb = probe.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    if (w > 0 && h > 0) {
      const maxDim = vbSize - 2 * padding;
      const scale = Math.min(maxDim / w, maxDim / h, 1);
      if (scale < 1) fontSize = Math.round(fontSize * scale * 10) / 10;
    }
  }

  let svg;
  if (ta.tight) {
    // Tight bounding box — viewBox wraps the glyph exactly (+ padding)
    const path = font.getPath(ta.text, 0, 0, fontSize);
    const bb = path.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    const vw = Math.round((w + 2 * padding) * 100) / 100;
    const vh = Math.round((h + 2 * padding) * 100) / 100;
    const tx = padding - bb.x1;
    const ty = padding - bb.y1;
    const tightPath = font.getPath(ta.text, tx, ty, fontSize);
    const d = tightPath.toPathData(2);
    svg = `<svg width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" fill="none" xmlns="http://www.w3.org/2000/svg">\n  <path d="${d}" fill="${color}"/>\n</svg>`;
  } else {
    // Fixed-size square viewBox with centered text
    const { path, error } = generateLetterPath(font, ta.text, color, fontSize, 0, 0, center);
    if (error) console.error(`Warning: ${error}`);
    svg = `<svg width="${vbSize}" height="${vbSize}" viewBox="0 0 ${vbSize} ${vbSize}" fill="none" xmlns="http://www.w3.org/2000/svg">\n  ${path}\n</svg>`;
  }

  // Optimize with svgo
  const optimized = optimize(svg, {
    multipass: true,
    plugins: [
      { name: 'preset-default', params: { overrides: { removeViewBox: false, convertPathData: false } } },
      'sortAttrs',
    ],
  }).data;

  if (ta.out) {
    await writeFile(resolve(ta.out), optimized + '\n');
    console.error(`Created: ${resolve(ta.out)}`);
  } else {
    console.log(optimized);
  }
  process.exit(0);
}

// ── CLI Argument Parsing ─────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    letter:      { type: 'string',  short: 'l' },
    shape:       { type: 'string',  short: 's', default: 'circle' },
    color:       { type: 'string',  short: 'c', default: 'blue' },
    font:        { type: 'string',  short: 'f', default: 'open-sans' },
    'font-file': { type: 'string' },
    'google-font': { type: 'string' },
    'font-weight': { type: 'string', default: '600' },
    bold:        { type: 'boolean', default: false },
    italic:      { type: 'boolean', default: false },
    'font-size': { type: 'string' },
    'x-offset':  { type: 'string', default: '0' },
    'y-offset':  { type: 'string', default: '0' },
    'stroke-width': { type: 'string', default: '1' },
    'shape-scale':  { type: 'string' },
    modifier:    { type: 'string',  short: 'm' },
    'notch-width':  { type: 'string' },
    'notch-height': { type: 'string' },
    'notch-radius': { type: 'string' },
    'badge-svg':    { type: 'string' },
    'badge-x-offset': { type: 'string', default: '0' },
    'badge-y-offset': { type: 'string', default: '0' },
    'badge-scale':    { type: 'string', default: '1' },
    name:        { type: 'string',  short: 'n' },
    out:         { type: 'string',  short: 'o', default: '.' },
    'light-fill':   { type: 'string' },
    'light-stroke': { type: 'string' },
    'dark-fill':    { type: 'string' },
    'dark-stroke':  { type: 'string' },
    'light-only':   { type: 'boolean', default: false },
    'dark-only':    { type: 'boolean', default: false },
    stdout:      { type: 'boolean', default: false },
    list:        { type: 'string' },
    help:        { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Letter Icon Composer — CLI

Usage:
  node cli.js --letter <char> [options]

Required:
  -l, --letter <char>      Letter(s) to render (e.g. N, Ab)

Shape & Color:
  -s, --shape <name>       Shape: ${Object.keys(SHAPES).join(', ')} (default: circle)
  -c, --color <preset>     Color preset: ${PRESETS.map(p => p.name.toLowerCase()).join(', ')} (default: blue)
  --light-fill <hex>       Override light fill color
  --light-stroke <hex>     Override light stroke/letter color
  --dark-fill <hex>        Override dark fill color
  --dark-stroke <hex>      Override dark stroke/letter color

Font:
  -f, --font <key>         Built-in font: open-sans, inter (default: open-sans)
  --font-file <path>       Load a local .ttf/.otf/.woff file
  --google-font <name>     Load a Google Font by name (e.g. "Roboto")
  --font-weight <weight>   Google font weight: 400, 500, 600, 700 (default: 600)
  --bold                   Use bold variant
  --italic                 Use italic variant

Fine Tuning:
  --font-size <n>          Font size in SVG units (auto-calibrated if omitted)
  --x-offset <n>           Horizontal offset (default: 0)
  --y-offset <n>           Vertical offset (default: 0)
  --stroke-width <n>       Shape stroke width (default: 1)
  --shape-scale <n>        Shape scale factor (default: per-shape or 1.0)

Modifier:
  -m, --modifier <name>    Badge modifier: ${Object.keys(MODIFIERS).join(', ')} (default: none)
  --notch-width <n>        Notch width (default: 8)
  --notch-height <n>       Notch height (default: 8)
  --notch-radius <n>       Notch corner radius (default: 2)
  --badge-svg <file>       Custom SVG badge file (implies --modifier custom)
  --badge-x-offset <n>     Badge horizontal offset (default: 0)
  --badge-y-offset <n>     Badge vertical offset (default: 0)
  --badge-scale <n>        Badge scale factor (default: 1.0)

Output:
  -n, --name <name>        Base file name (default: derived from letter)
  -o, --out <dir>          Output directory (default: current directory)
  --light-only             Only generate light variant
  --dark-only              Only generate dark variant
  --stdout                 Print SVG to stdout instead of writing files

Batch:
  --list <preset|shape|modifier>  List available presets, shapes, or modifiers and exit

Examples:
  node cli.js -l N -s circle -c blue -o ./icons/
  node cli.js -l E -s hexagon -c purple --name element
  node cli.js -l R -s document -c blue --font inter --bold
  node cli.js -l N -s circle -c blue -m plus
  node cli.js --list presets
  node cli.js --list shapes
  node cli.js --list modifiers

Subcommands:
  node cli.js text-to-svg --text <string> [options]
    Convert text to SVG paths — useful for creating letter badges.
    Run "node cli.js text-to-svg --help" for details.
`);
  process.exit(0);
}

// ── List Mode ────────────────────────────────────────────────────────
if (args.list) {
  if (args.list === 'presets' || args.list === 'colors') {
    console.log('Available color presets:\n');
    const maxLen = Math.max(...PRESETS.map(p => p.name.length));
    for (const p of PRESETS) {
      const tag = p.official ? ' (JetBrains)' : '';
      console.log(`  ${p.name.padEnd(maxLen)}  light: ${p.lightFill} / ${p.lightStroke}   dark: ${p.darkFill} / ${p.darkStroke}${tag}`);
    }
  } else if (args.list === 'shapes') {
    console.log('Available shapes:\n');
    const maxLen = Math.max(...Object.keys(SHAPES).map(k => k.length));
    for (const [key, shape] of Object.entries(SHAPES)) {
      const tag = shape.official ? ' (JetBrains)' : '';
      console.log(`  ${key.padEnd(maxLen)}  ${shape.label}${tag}`);
    }
  } else if (args.list === 'modifiers') {
    console.log('Available modifiers:\n');
    const maxLen = Math.max(...Object.keys(MODIFIERS).map(k => k.length));
    for (const [key, mod] of Object.entries(MODIFIERS)) {
      console.log(`  ${key.padEnd(maxLen)}  ${mod.label}`);
    }
  } else {
    console.error(`Unknown list: "${args.list}". Use "presets", "shapes", or "modifiers".`);
    process.exit(1);
  }
  process.exit(0);
}

// ── Validate Required Args ───────────────────────────────────────────
if (!args.letter) {
  console.error('Error: --letter is required. Run with --help for usage.');
  process.exit(1);
}

if (!SHAPES[args.shape]) {
  console.error(`Error: Unknown shape "${args.shape}". Valid shapes: ${Object.keys(SHAPES).join(', ')}`);
  process.exit(1);
}

// --badge-svg implies --modifier custom
if (args['badge-svg'] && !args.modifier) args.modifier = 'custom';

const modifierKey = args.modifier || 'none';
if (!MODIFIERS[modifierKey]) {
  console.error(`Error: Unknown modifier "${modifierKey}". Valid modifiers: ${Object.keys(MODIFIERS).join(', ')}`);
  process.exit(1);
}

// ── Resolve Colors ───────────────────────────────────────────────────
const preset = findPreset(args.color);
if (!preset && !(args['light-fill'] && args['light-stroke'] && args['dark-fill'] && args['dark-stroke'])) {
  console.error(`Error: Unknown color preset "${args.color}". Use --list presets to see available presets, or provide all four --light-fill/--light-stroke/--dark-fill/--dark-stroke.`);
  process.exit(1);
}

const colors = {
  lightFill:   args['light-fill']   || preset?.lightFill,
  lightStroke: args['light-stroke'] || preset?.lightStroke,
  darkFill:    args['dark-fill']    || preset?.darkFill,
  darkStroke:  args['dark-stroke']  || preset?.darkStroke,
};

// ── Load Font ────────────────────────────────────────────────────────
async function fetchFont(url) {
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const buf = await resp.arrayBuffer();
  return opentype.parse(buf);
}

async function loadFont() {
  // Local file takes priority
  if (args['font-file']) {
    const buf = await readFile(resolve(args['font-file']));
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }

  // Google Font
  if (args['google-font']) {
    const urls = getGoogleFontUrl(args['google-font'], args['font-weight'], args.bold, args.italic);
    for (const url of urls) {
      try {
        const font = await fetchFont(url);
        if (font) return font;
      } catch { /* try next subset */ }
    }
    console.error(`Error: Could not load Google Font "${args['google-font']}". Check spelling.`);
    process.exit(1);
  }

  // Built-in font
  const url = getFontUrl(args.font, args.bold, args.italic);
  if (!url) {
    console.error(`Error: Font "${args.font}" does not have the requested variant (bold=${args.bold}, italic=${args.italic}).`);
    process.exit(1);
  }

  const font = await fetchFont(url);
  if (!font) {
    console.error(`Error: Failed to download font from ${url}`);
    process.exit(1);
  }
  return font;
}

// ── SVG Optimization ─────────────────────────────────────────────────
const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          inlineStyles: false,
          removeViewBox: false,
          cleanupEnableBackground: false,
          removeHiddenElems: false,
          convertShapeToPath: false,
          moveElemsAttrsToGroup: false,
          moveGroupAttrsToElems: false,
          convertPathData: false,
        },
      },
    },
    'convertStyleToAttrs',
    'cleanupListOfValues',
    'sortAttrs',
  ],
};

function optimizeSVG(svgString) {
  return optimize(svgString, svgoConfig).data;
}

// ── Modifier Engine ──────────────────────────────────────────────────
let applyModifier = (svg) => svg;
if (modifierKey !== 'none') {
  let paper = null;
  try {
    paper = (await import('paper-jsdom')).default;
  } catch {
    console.error('\x1b[33m\u26A0\uFE0F  paper-jsdom not found — using clipPath fallback (no path subtraction)\x1b[0m');
    console.error('\x1b[33m   For cleaner output, install: \x1b[1mnpm install paper-jsdom canvas jsdom\x1b[0m\n');
  }
  ({ applyModifier } = await createModifierEngine(paper));
}

const nw = args['notch-width'] ? parseFloat(args['notch-width']) : 8;
const nh = args['notch-height'] ? parseFloat(args['notch-height']) : 8;
const nr = args['notch-radius'] ? parseFloat(args['notch-radius']) : 2;

// Load custom badge SVG
let badgeOpts = undefined;
if (args['badge-svg']) {
  const badgeSvgText = await readFile(resolve(args['badge-svg']), 'utf-8');
  if (!badgeSvgText.includes('<svg')) {
    console.error('Error: --badge-svg file does not contain valid SVG markup.');
    process.exit(1);
  }
  badgeOpts = {
    customBadgeSvg: badgeSvgText,
    badgeXOffset: parseFloat(args['badge-x-offset']),
    badgeYOffset: parseFloat(args['badge-y-offset']),
    badgeScale: parseFloat(args['badge-scale']),
  };
}

// ── Generate ─────────────────────────────────────────────────────────
const font = await loadFont();

const commonParams = {
  font,
  letter: args.letter,
  shape: args.shape,
  strokeWidth: parseFloat(args['stroke-width']),
  fontSize: args['font-size'] ? parseFloat(args['font-size']) : undefined,
  xOffset: parseFloat(args['x-offset']),
  yOffset: parseFloat(args['y-offset']),
  shapeScale: args['shape-scale'] ? parseFloat(args['shape-scale']) : undefined,
};

const lightResult = generateSVG({
  ...commonParams,
  fill: colors.lightFill,
  stroke: colors.lightStroke,
  letterColor: colors.lightStroke,
});

const darkResult = generateSVG({
  ...commonParams,
  fill: colors.darkFill,
  stroke: colors.darkStroke,
  letterColor: colors.darkStroke,
});

for (const r of [lightResult, darkResult]) {
  if (r.error) {
    console.error(`Warning: ${r.error}`);
  }
}

let rawLight = lightResult.svg;
let rawDark = darkResult.svg;

if (modifierKey !== 'none') {
  const vbs = lightResult.viewBoxSize;
  rawLight = applyModifier(rawLight, modifierKey, colors.lightStroke, vbs, nw, nh, nr, badgeOpts);
  rawDark = applyModifier(rawDark, modifierKey, colors.darkStroke, vbs, nw, nh, nr, badgeOpts);
}

const lightSVG = optimizeSVG(rawLight);
const darkSVG = optimizeSVG(rawDark);

// ── Output ───────────────────────────────────────────────────────────
const baseName = args.name || args.letter.toLowerCase();

if (args.stdout) {
  if (!args['dark-only']) {
    console.log(`<!-- ${baseName}.svg (light) -->`);
    console.log(lightSVG);
  }
  if (!args['light-only']) {
    if (!args['dark-only']) console.log();
    console.log(`<!-- ${baseName}_dark.svg (dark) -->`);
    console.log(darkSVG);
  }
} else {
  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const written = [];

  if (!args['dark-only']) {
    const lightPath = join(outDir, `${baseName}.svg`);
    await writeFile(lightPath, lightSVG + '\n');
    written.push(lightPath);
  }

  if (!args['light-only']) {
    const darkPath = join(outDir, `${baseName}_dark.svg`);
    await writeFile(darkPath, darkSVG + '\n');
    written.push(darkPath);
  }

  for (const p of written) {
    console.log(`Created: ${p}`);
  }
}
