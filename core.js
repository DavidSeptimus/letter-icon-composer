/**
 * Letter Icon Composer — shared core module.
 * Pure generation logic with no DOM dependency.
 * Used by both the browser UI (index.html) and the Node.js CLI (cli.js).
 */

import { create as fontkitCreate } from 'fontkit';

// ── Font Parsing ─────────────────────────────────────────────────────
/**
 * Parses a font from an ArrayBuffer or Buffer using fontkit.
 * @param {ArrayBuffer|Buffer|Uint8Array} buffer - Font data
 * @returns {object} A fontkit Font object
 */
export function parseFont(buffer) {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return fontkitCreate(uint8);
}

// ── Text Path Helper ─────────────────────────────────────────────────
/**
 * Lays out text using fontkit and returns an object with `getBoundingBox()`
 * and `toPathData()` methods for SVG rendering.
 *
 * @param {object} font - A fontkit Font object
 * @param {string} text - The text to render
 * @param {number} x - X position of the text origin
 * @param {number} y - Y baseline position (SVG y-down coordinate)
 * @param {number} fontSize - Font size in SVG units
 * @returns {{ getBoundingBox(): {x1,y1,x2,y2}, toPathData(dp?: number): string }}
 */
export function getTextPath(font, text, x, y, fontSize) {
  const run = font.layout(text);
  const s = fontSize / font.unitsPerEm;

  const svgParts = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let curX = x;

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    const pos = run.positions[i];
    const gx = curX + pos.xOffset * s;
    const gy = y - pos.yOffset * s;

    const p = glyph.path.scale(s, -s).translate(gx, gy);
    const svg = p.toSVG();
    if (svg) svgParts.push(svg);

    const bb = p.bbox;
    if (bb.minX < bb.maxX) {
      minX = Math.min(minX, bb.minX);
      minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX);
      maxY = Math.max(maxY, bb.maxY);
    }
    curX += pos.xAdvance * s;
  }

  // If no visible glyphs, return zero-size bounding box
  if (minX === Infinity) {
    minX = x; minY = y; maxX = x; maxY = y;
  }

  const combined = svgParts.join('');

  return {
    getBoundingBox() {
      return { x1: minX, y1: minY, x2: maxX, y2: maxY };
    },
    toPathData(decimalPlaces) {
      if (decimalPlaces == null) return combined;
      // Round numbers in the path data to the given precision
      const factor = Math.pow(10, decimalPlaces);
      return combined.replace(/-?\d+(\.\d+)?/g, m => {
        const n = parseFloat(m);
        return String(Math.round(n * factor) / factor);
      });
    },
  };
}

// ── Color Presets (extracted from JetBrains expUI icons) ─────────────
export const PRESETS = [
  // JetBrains expUI official colors
  { name: 'Blue',   lightFill: '#E7EFFD', lightStroke: '#3574F0', darkFill: '#25324D', darkStroke: '#548AF7', official: true },
  { name: 'Orange', lightFill: '#FFF4EB', lightStroke: '#E66D17', darkFill: '#45322B', darkStroke: '#C77D55', official: true },
  { name: 'Purple', lightFill: '#FAF5FF', lightStroke: '#834DF0', darkFill: '#2F2936', darkStroke: '#A571E6', official: true },
  { name: 'Red',    lightFill: '#FFF7F7', lightStroke: '#DB3B4B', darkFill: '#402929', darkStroke: '#DB5C5C', official: true },
  { name: 'Green',  lightFill: '#F2FCF3', lightStroke: '#208A3C', darkFill: '#253627', darkStroke: '#57965C', official: true },
  { name: 'Amber',  lightFill: '#FFFAEB', lightStroke: '#C27D04', darkFill: '#3D3223', darkStroke: '#D6AE58', official: true },
  // Custom extras
  { name: 'Grey',   lightFill: '#F0F0F0', lightStroke: '#757575', darkFill: '#303030', darkStroke: '#9E9E9E', official: false },
  { name: 'Teal',   lightFill: '#E0F2F1', lightStroke: '#00796B', darkFill: '#1A3230', darkStroke: '#4DB6AC', official: false },
  { name: 'Pink',   lightFill: '#FCE4EC', lightStroke: '#AD1457', darkFill: '#3B2430', darkStroke: '#F06292', official: false },
];

// ── Shape Generators ─────────────────────────────────────────────────
// Each shape generator receives (fill, stroke, strokeWidth, center) where
// center = viewBoxSize / 2.  Shapes must fit within a 1px transparent
// border, i.e. from 1 to viewBoxSize-1.
// Official shapes are derived from JetBrains expUI icons.
export const SHAPES = {
  // ── Official (JetBrains expUI) ──
  circle: {
    official: true,
    label: 'Circle',
    preview: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) =>
      `<circle cx="${c}" cy="${c}" r="${c - 1 - sw/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  },

  roundrect: {
    official: true,
    label: 'Rounded Rect',
    preview: '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) => {
      const inset = 1.5 + sw/2;
      const size = 2 * (c - 1.5) - sw;
      return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    },
  },

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

  'rounded-diamond': {
    official: true,
    label: 'Rounded Diamond',
    viewBoxSize: 18,
    targetHeight: 6.3,
    preview: '<rect x="4.34" y="4.34" width="9.32" height="9.32" rx="1.5" transform="rotate(45 9 9)" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) => {
      const halfDiag = c - 1 - sw/2;
      const side = Math.round(halfDiag * Math.SQRT2 * 100) / 100;
      const offset = Math.round((c - side/2) * 100) / 100;
      return `<rect x="${offset}" y="${offset}" width="${side}" height="${side}" rx="1.5" transform="rotate(45 ${c} ${c})" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    },
  },

  shield: {
    official: true,
    label: 'Shield',
    targetHeight: 6.3,
    preview: '<path d="M2.5 3.83L8 1.54L13.5 3.83V9.18C13.5 10.75 12.71 11.92 11.63 12.89C10.83 13.6 9.85 14.23 8.9 14.82L8 15.4L7.1 14.82C6.15 14.23 5.17 13.6 4.37 12.89C3.29 11.92 2.5 10.75 2.5 9.18V3.83Z" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M2.5 3.83333L8 1.54167L13.5 3.83333L13.5 9.17871C13.5 10.7502 12.7145 11.9168 11.6339 12.8852C10.8323 13.6036 9.84849 14.226 8.90452 14.8218L8.9021 14.8233C8.59264 15.0186 8.28712 15.2115 8 15.4009C7.71296 15.2115 7.40754 15.0187 7.09817 14.8235L7.09548 14.8218C6.15151 14.226 5.16769 13.6036 4.36607 12.8852C3.28548 11.9168 2.5 10.7502 2.5 9.17871V3.83333Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  },

  'dashed-circle': {
    official: true,
    label: 'Dashed Circle',
    preview: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 2"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M12.9498 3.05025C15.6835 5.78392 15.6835 10.2161 12.9498 12.9497C10.2162 15.6834 5.784 15.6834 3.05033 12.9497C0.316663 10.2161 0.316663 5.78392 3.05033 3.05025C5.784 0.316582 10.2162 0.316583 12.9498 3.05025Z" fill="${fill}"/>` +
      `\n  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.9144 6.90481L13.9266 7.06045C13.736 5.85124 13.1756 4.69027 12.2427 3.75736C11.3098 2.82445 10.1488 2.26404 8.93963 2.07352L9.09527 1.0857C10.5063 1.30802 11.8624 1.96287 12.9498 3.05025C14.0372 4.13763 14.6921 5.49375 14.9144 6.90481ZM6.90489 1.0857L7.06053 2.07352C5.85132 2.26404 4.69035 2.82445 3.75744 3.75736C2.82453 4.69027 2.26412 5.85124 2.0736 7.06045L1.08579 6.90481C1.30811 5.49375 1.96295 4.13763 3.05033 3.05025C4.13771 1.96287 5.49383 1.30802 6.90489 1.0857ZM1.08579 9.09519C1.30811 10.5063 1.96295 11.8624 3.05033 12.9497C4.13771 14.0371 5.49383 14.692 6.90489 14.9143L7.06053 13.9265C5.85132 13.736 4.69035 13.1755 3.75744 12.2426C2.82453 11.3097 2.26412 10.1488 2.0736 8.93955L1.08579 9.09519ZM9.09527 14.9143L8.93963 13.9265C10.1488 13.736 11.3098 13.1755 12.2427 12.2426C13.1756 11.3097 13.736 10.1488 13.9266 8.93955L14.9144 9.09519C14.6921 10.5063 14.0372 11.8624 12.9498 12.9497C11.8624 14.0371 10.5063 14.692 9.09527 14.9143Z" fill="${stroke}"/>`,
  },

  'dashed-rect': {
    official: true,
    label: 'Dashed Rect',
    preview: '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 2"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M2 4C2 2.89543 2.89543 2 4 2H12C13.1046 2 14 2.89543 14 4V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V4Z" fill="${fill}"/>` +
      `\n  <path d="M9 3H12C12.5523 3 13 3.44772 13 4V7H14V4C14 2.89543 13.1046 2 12 2H9V3Z" fill="${stroke}"/>` +
      `\n  <path d="M7 3V2H4C2.89543 2 2 2.89543 2 4V7H3V4C3 3.44772 3.44772 3 4 3H7Z" fill="${stroke}"/>` +
      `\n  <path d="M3 9H2V12C2 13.1046 2.89543 14 4 14H7V13H4C3.44772 13 3 12.5523 3 12V9Z" fill="${stroke}"/>` +
      `\n  <path d="M9 13V14H12C13.1046 14 14 13.1046 14 12V9H13V12C13 12.5523 12.5523 13 12 13H9Z" fill="${stroke}"/>`,
  },

  // ── Custom ──
  composite: {
    official: false,
    label: 'Composite',
    targetHeight: 5.0,
    defaultXOffset: -1.5,
    defaultYOffset: 1.5,
    preview: '<rect x="2" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M13 10V3.5C13 2.67 12.33 2 11.5 2H5" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M13 10V3.5C13 2.67 12.33 2 11.5 2H5" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>` +
      `\n  <rect x="2" y="5" width="9" height="9" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  },

  hexagon: {
    official: false,
    label: 'Hexagon',
    targetHeight: 5.5,
    preview: '<path d="M8 2.5L13 5v6L8 13.5L3 11v-6Z" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M8 2.5L13 5v6L8 13.5L3 11v-6Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
  },

  document: {
    official: false,
    label: 'Document',
    targetHeight: 5.5,
    defaultYOffset: 1,
    preview: '<path d="M3.75 2.25h6.5l3 3v7.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1"/>',
    generate: (fill, stroke, sw, c) =>
      `<path d="M3.75 2.25h6.5l3 3v7.5a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-9.5a1 1 0 0 1 1-1z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>` +
      `\n  <path d="M10.25 2.25v3h3" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
  },
};

// ── Modifier Definitions ─────────────────────────────────────────────
// Corner modifiers that clip the bottom-right of the main shape and
// render a small badge icon in the freed area.
// All generate() paths are authored for a 16×16 viewBox; larger viewBoxes
// are handled by translating the modifier group at call site.
export const MODIFIERS = {
  none: {
    label: 'None',
    preview: '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3" stroke-dasharray="2 2"/>',
    generate: () => '',
  },
  custom: {
    label: 'Custom',
    preview: '<rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 1.5"/><text x="8" y="10" text-anchor="middle" font-size="5.5" fill="currentColor" font-family="sans-serif">SVG</text>',
    generate: () => '',
  },
};

// ── Font URL Resolution ──────────────────────────────────────────────
export function getFontUrl(key, bold, italic) {
  if (key === 'open-sans') {
    const weight = bold ? 'Bold' : 'SemiBold';
    const style = italic ? 'Italic' : '';
    return `https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-${weight}${style}.ttf`;
  }
  if (key === 'inter') {
    if (italic) return null;
    const weight = bold ? 'Bold' : 'SemiBold';
    return `https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-${weight}.otf`;
  }
  return null;
}

export function toFontsourceSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export async function getGoogleFontSubsets(name) {
  const slug = toFontsourceSlug(name);
  try {
    const resp = await fetch(`https://api.fontsource.org/v1/fonts/${slug}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return { subsets: data.subsets || [], weights: data.weights || [], styles: data.styles || [] };
  } catch {
    return null;
  }
}

export function getGoogleFontUrl(name, weight, bold, italic, subset) {
  const slug = toFontsourceSlug(name);
  const effectiveWeight = bold ? '700' : weight;
  const fontStyle = italic ? 'italic' : 'normal';
  if (subset) {
    return [`https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/${subset}-${effectiveWeight}-${fontStyle}.woff`];
  }
  const subsets = ['latin', 'latin-ext', 'symbols', 'all'];
  return subsets.map(s =>
    `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/${s}-${effectiveWeight}-${fontStyle}.woff`
  );
}

// ── Font Size Calibration ────────────────────────────────────────────
/**
 * Computes the fontSize that produces a glyph of the given target height
 * in SVG units, matching JetBrains icon conventions.  When a letter is
 * provided the *actual* glyph height is used for calibration, so
 * lowercase characters are scaled up to the same visual height as
 * uppercase ones.
 * @param {object} font - A fontkit Font object
 * @param {string} [letter='E'] - The letter(s) to calibrate against
 * @param {number} [targetHeight=7.0] - Desired glyph height in SVG units
 * @returns {number} The calibrated font size
 */
export function calibrateFontSize(font, letter = 'E', targetHeight = 7.0) {
  // Always calibrate against cap height ('E') for consistent stroke weight
  const testPath = getTextPath(font, 'E', 0, 0, 100);
  const bb = testPath.getBoundingBox();
  const heightAt100 = bb.y2 - bb.y1;
  if (heightAt100 <= 0) return 7.0;
  return Math.round((targetHeight / heightAt100) * 100 * 10) / 10;
}

// ── Content Fit Scaling (internal) ───────────────────────────────────
/**
 * Computes a scale factor (0..1] so that a text bounding box of the given
 * width/height fits inside the usable interior of a shape with 1px padding
 * from the inner stroke edge.
 * @param {number} textW - Text bounding box width
 * @param {number} textH - Text bounding box height
 * @param {string} shapeName - Shape key (see SHAPES)
 * @param {number} strokeWidth - Shape stroke width
 * @param {number} xOffset - User horizontal offset
 * @param {number} yOffset - User vertical offset
 * @param {number} shapeScale - Shape scale factor
 * @returns {number} Scale factor to multiply fontSize by (clamped to 1)
 */
function contentFitScale(textW, textH, shapeName, strokeWidth, xOffset, yOffset, shapeScale) {
  const pad = 1;
  const sc = shapeScale;
  const sw = strokeWidth;
  const shapeDef = SHAPES[shapeName];
  if (!shapeDef) return 1;

  const c = (shapeDef.viewBoxSize ?? 16) / 2;
  // Dashed shapes use effectiveSW=1 regardless of strokeWidth
  const isDashed = shapeName === 'dashed-circle' || shapeName === 'dashed-rect';
  const esw = isDashed ? 1 : sw;

  const halfW = textW / 2;
  const halfH = textH / 2;

  let scale = 1;

  if (shapeName === 'circle' || shapeName === 'dashed-circle') {
    // Circle inscribed constraint: text diagonal/2 <= r
    const r = (c - 1 - esw) * sc - pad - Math.sqrt(xOffset * xOffset + yOffset * yOffset);
    if (r > 0) {
      const diag = Math.sqrt(halfW * halfW + halfH * halfH);
      if (diag > r) scale = r / diag;
    }
  } else if (shapeName === 'diamond' || shapeName === 'rounded-diamond') {
    // Diamond (L1 norm): halfW + halfH <= d
    const d = (c - 1 - esw) * sc - pad - Math.abs(xOffset) - Math.abs(yOffset);
    if (d > 0) {
      const l1 = halfW + halfH;
      if (l1 > d) scale = d / l1;
    }
  } else if (shapeName === 'shield') {
    const shW = (5.5 - esw / 2) * sc - pad - Math.abs(xOffset);
    const shH = (4.17 - esw / 2) * sc - pad - Math.abs(yOffset);
    if (shW > 0 && shH > 0) {
      const sx = halfW > shW ? shW / halfW : 1;
      const sy = halfH > shH ? shH / halfH : 1;
      scale = Math.min(sx, sy);
    }
  } else if (shapeName === 'hexagon') {
    const hW = (5.0 - esw / 2) * sc - pad - Math.abs(xOffset);
    const hH = (5.5 - esw / 2) * sc - pad - Math.abs(yOffset);
    if (hW > 0 && hH > 0) {
      const sx = halfW > hW ? hW / halfW : 1;
      const sy = halfH > hH ? hH / halfH : 1;
      scale = Math.min(sx, sy);
    }
  } else if (shapeName === 'document') {
    const dW = (4.25 - esw / 2) * sc - pad - Math.abs(xOffset);
    const dH = (3.75 - esw / 2) * sc - pad - Math.abs(yOffset);
    if (dW > 0 && dH > 0) {
      const sx = halfW > dW ? dW / halfW : 1;
      const sy = halfH > dH ? dH / halfH : 1;
      scale = Math.min(sx, sy);
    }
  } else if (shapeName === 'composite') {
    const cW = (4.5 - esw / 2) * sc - pad - Math.abs(xOffset);
    const cH = (4.5 - esw / 2) * sc - pad - Math.abs(yOffset);
    if (cW > 0 && cH > 0) {
      const sx = halfW > cW ? cW / halfW : 1;
      const sy = halfH > cH ? cH / halfH : 1;
      scale = Math.min(sx, sy);
    }
  } else {
    // roundrect, dashed-rect — rectangle constraint
    const halfExtentW = (c - 1.5 - esw) * sc - pad - Math.abs(xOffset);
    const halfExtentH = (c - 1.5 - esw) * sc - pad - Math.abs(yOffset);
    if (halfExtentW > 0 && halfExtentH > 0) {
      const sx = halfW > halfExtentW ? halfExtentW / halfW : 1;
      const sy = halfH > halfExtentH ? halfExtentH / halfH : 1;
      scale = Math.min(sx, sy);
    }
  }

  return Math.min(scale, 1);
}

// ── Bound Font Size to Shape ─────────────────────────────────────────
/**
 * For multi-character text, reduces the calibrated font size so the rendered
 * text fits within the shape interior.  Single-character text is returned
 * unchanged (the cap-height calibration already handles it).
 * @param {object} font - A fontkit Font object
 * @param {string} letter - The letter(s) to render
 * @param {number} calibratedSize - Font size from calibrateFontSize()
 * @param {string} shapeName - Shape key
 * @param {number} strokeWidth - Shape stroke width
 * @param {number} xOffset - User horizontal offset
 * @param {number} yOffset - User vertical offset
 * @param {number} shapeScale - Shape scale factor
 * @returns {number} Bounded font size (rounded to 1 decimal)
 */
export function boundFontSizeToShape(font, letter, calibratedSize, shapeName, strokeWidth, xOffset, yOffset, shapeScale) {
  if (!font || !letter || letter.length <= 1) return calibratedSize;

  const path = getTextPath(font, letter, 0, 0, calibratedSize);
  const bb = path.getBoundingBox();
  const w = bb.x2 - bb.x1;
  const h = bb.y2 - bb.y1;
  if (w <= 0 && h <= 0) return calibratedSize;

  const scale = contentFitScale(w, h, shapeName, strokeWidth, xOffset, yOffset, shapeScale);
  return Math.round(calibratedSize * scale * 10) / 10;
}

// ── Letter Path Generation ───────────────────────────────────────────
/**
 * Generates an SVG <path> element for a letter centered in the viewBox.
 * @param {object} font - A fontkit Font object
 * @param {string} letter - The letter(s) to render
 * @param {string} fill - Fill color for the letter path
 * @param {number} fontSize - Font size in SVG units
 * @param {number} [xOff=0] - Horizontal offset from center
 * @param {number} [yOff=0] - Vertical offset from center
 * @param {number} [center=8] - Center coordinate of the viewBox
 * @returns {{ path: string, error: string|null }}
 */
export function generateLetterPath(font, letter, fill, fontSize, xOff = 0, yOff = 0, center = 8) {
  if (!font || !letter) return { path: '', error: null };

  try {
    // Check for missing glyphs using fontkit's cmap lookup
    const missing = [...letter].filter(ch => !font.hasGlyphForCodePoint(ch.codePointAt(0)));
    if (missing.length > 0) {
      const chars = missing.map(c => `"${c}" (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
      return { path: '', error: `The current font has no glyph for ${chars}.` };
    }

    const path = getTextPath(font, letter, 0, 0, fontSize);
    const bb = path.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;

    if (w === 0 && h === 0) {
      return { path: '', error: `The current font has no glyph for "${letter}".` };
    }

    const cx = center + xOff;
    const cy = center + yOff;
    const tx = cx - w / 2 - bb.x1;
    const ty = cy - h / 2 - bb.y1;

    const centered = getTextPath(font, letter, tx, ty, fontSize);
    const d = centered.toPathData(2);
    return { path: `<path d="${d}" fill="${fill}"/>`, error: null };
  } catch (e) {
    return { path: '', error: `Error generating letter path: ${e.message}` };
  }
}

// ── Full SVG Assembly ────────────────────────────────────────────────
/**
 * Generates a complete SVG icon with shape background and letter overlay.
 * The viewBox is 16x16 by default but expands automatically for shapes
 * that declare a larger native size (e.g. diamond → 18x18).
 * All shapes are sized to leave a 1px transparent border:
 * 16x16 → 14x14 content area, 18x18 → 16x16 content area.
 * @param {object} params
 * @param {object} params.font - A fontkit Font object
 * @param {string} params.letter - The letter(s) to render
 * @param {string} params.shape - Shape name (see SHAPES keys)
 * @param {string} params.fill - Shape fill color
 * @param {string} params.stroke - Shape stroke color
 * @param {string} params.letterColor - Letter fill color
 * @param {number} [params.strokeWidth=1] - Shape stroke width
 * @param {number} [params.fontSize] - Font size (auto-calibrated if omitted)
 * @param {number} [params.xOffset=0] - Horizontal letter offset
 * @param {number} [params.yOffset=0] - Vertical letter offset
 * @param {number} [params.shapeScale] - Shape scale factor (default per-shape or 1.0)
 * @returns {{ svg: string, error: string|null, viewBoxSize: number }}
 */
export function generateSVG({
  font,
  letter,
  shape,
  fill,
  stroke,
  letterColor,
  strokeWidth = 1,
  fontSize,
  xOffset = 0,
  yOffset = 0,
  shapeScale,
}) {
  const shapeDef = SHAPES[shape];
  if (!shapeDef) {
    return { svg: '', error: `Unknown shape: "${shape}". Valid shapes: ${Object.keys(SHAPES).join(', ')}`, viewBoxSize: 16 };
  }

  const baseViewBox = shapeDef.viewBoxSize ?? 16;
  const scale = shapeScale ?? shapeDef.defaultScale ?? 1.0;
  const nativeCenter = baseViewBox / 2;

  // Compute viewBox — expand when scaling up
  let viewBoxSize;
  if (scale === 1.0) {
    viewBoxSize = baseViewBox;
  } else {
    const scaledHalf = scale * (nativeCenter - 1);
    viewBoxSize = Math.max(baseViewBox, Math.ceil(2 * scaledHalf + 2));
  }
  const center = viewBoxSize / 2;

  const targetHeight = shapeDef.targetHeight ?? 7.0;
  let size;
  if (fontSize != null) {
    size = fontSize;
  } else if (font) {
    const calibrated = calibrateFontSize(font, letter, targetHeight);
    size = boundFontSizeToShape(font, letter, calibrated, shape, strokeWidth, xOffset, yOffset, scale);
  } else {
    size = targetHeight;
  }

  // Generate shape at its native center (coordinates sized for 1px border)
  let shapeMarkup = shapeDef.generate(fill, stroke, strokeWidth, nativeCenter);

  // Apply scale transform only when scale != 1.0
  if (scale !== 1.0) {
    shapeMarkup = `<g transform="translate(${center} ${center}) scale(${scale}) translate(-${nativeCenter} -${nativeCenter})">\n    ${shapeMarkup}\n  </g>`;
  }

  const xOff = xOffset + (shapeDef.defaultXOffset ?? 0);
  const yOff = yOffset + (shapeDef.defaultYOffset ?? 0);
  const { path: letterMarkup, error } = generateLetterPath(font, letter, letterColor, size, xOff, yOff, center);

  const svg = `<svg width="${viewBoxSize}" height="${viewBoxSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
  ${shapeMarkup}
  ${letterMarkup}
</svg>`;

  return { svg, error, viewBoxSize };
}

// ── Preset Lookup ────────────────────────────────────────────────────
/**
 * Finds a preset by name (case-insensitive).
 * @param {string} name - Preset name (e.g. "blue", "Purple")
 * @returns {object|undefined}
 */
export function findPreset(name) {
  const lower = name.toLowerCase();
  return PRESETS.find(p => p.name.toLowerCase() === lower);
}
