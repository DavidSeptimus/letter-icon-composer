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
  generateSVG,
} from './core.js';
import { createModifierEngine } from './modifier.js';

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
  rawLight = applyModifier(rawLight, modifierKey, colors.lightStroke, vbs, nw, nh, nr);
  rawDark = applyModifier(rawDark, modifierKey, colors.darkStroke, vbs, nw, nh, nr);
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
