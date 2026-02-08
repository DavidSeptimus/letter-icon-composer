/**
 * Letter Icon Composer — Modifier Engine
 * Shared Paper.js-based modifier processing for both browser UI and CLI.
 *
 * Applies a badge silhouette cutout (bottom-right corner) to SVG shapes and
 * renders a custom badge icon in the freed area.
 *
 * When Paper.js is available: boolean path subtraction using expanded badge
 * silhouette + stroke rings for circle/rect. Compound fill-only paths also
 * use boolean subtraction. Stroked paths and fill-none use clipPath.
 *
 * When Paper.js is unavailable: pure clipPath fallback (no dependencies).
 */

import { MODIFIERS } from './core.js';

// ── Badge Placement ──────────────────────────────────────────────────

/**
 * Computes badge placement (position, scale, inner SVG content).
 * Used by both the full engine (for silhouette import + rendering) and
 * the clipPath fallback (for rendering only).
 */
function computeBadgePlacement(badgeSvg, viewBoxSize, xOff, yOff, userScale) {
  let minX = 0, minY = 0, badgeW = 16, badgeH = 16;
  const vbMatch = badgeSvg.match(/viewBox=["']([^"']+)["']/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      minX = parts[0]; minY = parts[1];
      badgeW = parts[2]; badgeH = parts[3];
    }
  } else {
    const wMatch = badgeSvg.match(/\bwidth=["']([0-9.]+)["']/);
    const hMatch = badgeSvg.match(/\bheight=["']([0-9.]+)["']/);
    if (wMatch) badgeW = parseFloat(wMatch[1]);
    if (hMatch) badgeH = parseFloat(hMatch[1]);
  }

  // Default target: viewBoxSize * 0.375 (equivalent to old notch=8 minus padding=2 → 6)
  const targetSize = viewBoxSize * 0.375;
  const fitScale = Math.min(targetSize / badgeW, targetSize / badgeH);
  const scale = fitScale * userScale;

  // Bottom-right alignment: badge corner flush with viewBox corner
  const tx = viewBoxSize - (minX + badgeW) * scale + xOff;
  const ty = viewBoxSize - (minY + badgeH) * scale + yOff;

  // Extract inner content between <svg...> and </svg>
  const innerMatch = badgeSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = innerMatch ? innerMatch[1].trim() : '';

  return { tx, ty, scale, inner, minX, minY, badgeW, badgeH };
}

// ── ClipPath-Only Fallback (no dependencies) ─────────────────────────

function applyModifierClipPath(svgString, modifierKey, modifierColor, viewBoxSize, opts) {
  if (!modifierKey || modifierKey === 'none') return svgString;
  const modDef = MODIFIERS[modifierKey];
  if (!modDef) return svgString;

  if (modifierKey !== 'custom' || !opts?.customBadgeSvg) return svgString;

  const placement = computeBadgePlacement(
    opts.customBadgeSvg, viewBoxSize,
    opts.badgeXOffset || 0, opts.badgeYOffset || 0, opts.badgeScale ?? 1.0);

  if (!placement.inner) return svgString;

  // Build a clip path that approximates the badge bounding box
  const s = viewBoxSize;
  const { tx, ty, scale, badgeW, badgeH, minX, minY } = placement;
  const gap = opts.badgeGap ?? 0.5;

  // Badge bounding rect in output coordinates, expanded by gap
  const bx = tx + minX * scale - gap;
  const by = ty + minY * scale - gap;
  const bw = badgeW * scale + gap * 2;
  const bh = badgeH * scale + gap * 2;

  // keepRegion = full viewBox minus badge bbox
  const keepPath = `M0 0H${s}V${s}H0Z M${bx} ${by}H${bx + bw}V${by + bh}H${bx}Z`;

  const badgeMarkup = `<g transform="translate(${+tx.toFixed(3)} ${+ty.toFixed(3)}) scale(${+scale.toFixed(4)})">${placement.inner}</g>`;

  const clipDef = `<defs><clipPath id="nc"><path d="${keepPath}" fill-rule="evenodd"/></clipPath></defs>`;
  svgString = svgString.replace(/(<svg[^>]*>)/, `$1${clipDef}<g clip-path="url(#nc)">`);
  svgString = svgString.replace('</svg>', `</g>${badgeMarkup}</svg>`);
  return svgString;
}

// ── Full Paper.js Engine ─────────────────────────────────────────────

async function createFullEngine(paper) {
  let DOMParser_, XMLSerializer_;
  if (typeof globalThis.DOMParser !== 'undefined') {
    DOMParser_ = globalThis.DOMParser;
    XMLSerializer_ = globalThis.XMLSerializer;
  } else {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM();
    DOMParser_ = dom.window.DOMParser;
    XMLSerializer_ = dom.window.XMLSerializer;
  }

  const paperScope = new paper.PaperScope();
  paperScope.setup(new paper.Size(1, 1));

  function applyPaperTransform(pp, transformStr) {
    const transforms = [];
    const re = /(translate|scale|rotate)\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(transformStr)) !== null)
      transforms.push({ type: m[1], nums: m[2].split(/[\s,]+/).map(Number) });
    for (let i = transforms.length - 1; i >= 0; i--) {
      const { type, nums } = transforms[i];
      if (type === 'translate') pp.translate(new paper.Point(nums[0], nums[1] || 0));
      else if (type === 'scale') pp.scale(nums[0], nums[1] ?? nums[0], new paper.Point(0, 0));
      else if (type === 'rotate') pp.rotate(nums[0], new paper.Point(nums[1] || 0, nums[2] || 0));
    }
  }

  function svgElToPaperPath(el) {
    const tag = el.tagName.toLowerCase();
    let p;
    if (tag === 'circle') {
      p = new paper.Path.Circle(
        new paper.Point(+el.getAttribute('cx'), +el.getAttribute('cy')),
        +el.getAttribute('r'));
    } else if (tag === 'rect') {
      const rx = +(el.getAttribute('rx') || 0);
      p = new paper.Path.Rectangle(
        new paper.Rectangle(+el.getAttribute('x'), +el.getAttribute('y'),
          +el.getAttribute('width'), +el.getAttribute('height')),
        new paper.Size(rx, rx));
    } else if (tag === 'path') {
      const d = el.getAttribute('d');
      if (!d) return null;
      // Use CompoundPath for multi-subpath data for correct boolean operations
      if (d.split(/[Mm]/).length > 2) {
        p = new paper.CompoundPath(d);
      } else {
        p = new paper.Path(d);
      }
    } else if (tag === 'ellipse') {
      const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy');
      const rx = +el.getAttribute('rx'), ry = +el.getAttribute('ry');
      p = new paper.Path.Ellipse(new paper.Rectangle(cx - rx, cy - ry, rx * 2, ry * 2));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number);
      const segments = [];
      for (let i = 0; i < pts.length; i += 2)
        segments.push(new paper.Point(pts[i], pts[i + 1]));
      p = new paper.Path(segments);
      if (tag === 'polygon') p.closePath();
    } else if (tag === 'line') {
      p = new paper.Path.Line(
        new paper.Point(+el.getAttribute('x1'), +el.getAttribute('y1')),
        new paper.Point(+el.getAttribute('x2'), +el.getAttribute('y2')));
    } else {
      return null;
    }
    const t = el.getAttribute('transform');
    if (t) applyPaperTransform(p, t);
    return p;
  }

  /**
   * Expand a path outward by `gap` using Minkowski-sum approximation.
   * Places circles along the path boundary and unites them — this naturally
   * handles sharp corners (rounding them) and never creates self-intersections.
   */
  function expandPath(path, gap) {
    if (gap <= 0) return path.clone();

    // For compound paths, flatten to a single unified outline first
    let sourcePath = path;
    if (path.className === 'CompoundPath') {
      let unified = path.children[0].clone();
      for (let i = 1; i < path.children.length; i++) {
        const next = unified.unite(path.children[i]);
        unified.remove();
        unified = next;
      }
      sourcePath = unified;
    }

    // If it's still compound after union, process each child
    if (sourcePath.className === 'CompoundPath') {
      const children = sourcePath.children.map(child => expandSinglePath(child, gap));
      let result = children[0];
      for (let i = 1; i < children.length; i++) {
        const next = result.unite(children[i]);
        result.remove();
        children[i].remove();
        result = next;
      }
      if (sourcePath !== path) sourcePath.remove();
      return result;
    }

    const result = expandSinglePath(sourcePath, gap);
    if (sourcePath !== path) sourcePath.remove();
    return result;
  }

  /** Tree-reduce: unite shapes pairwise for O(n log n) boolean ops */
  function treeUnite(shapes) {
    while (shapes.length > 1) {
      const next = [];
      for (let i = 0; i < shapes.length; i += 2) {
        if (i + 1 < shapes.length) {
          const u = shapes[i].unite(shapes[i + 1]);
          shapes[i].remove();
          shapes[i + 1].remove();
          next.push(u);
        } else {
          next.push(shapes[i]);
        }
      }
      shapes = next;
    }
    return shapes[0];
  }

  /**
   * Build a Minkowski circle buffer along a path's boundary.
   * Used by both expand (unite buffer with path) and contract (subtract buffer from path).
   */
  function buildCircleBuffer(path, radius) {
    const len = path.length;
    if (len <= 0) return null;
    const step = Math.max(0.2, Math.min(0.6, radius * 0.6));
    const circles = [];
    for (let d = 0; d < len; d += step) {
      const pt = path.getPointAt(d);
      if (pt) circles.push(new paper.Path.Circle(pt, radius));
    }
    if (circles.length === 0) return null;
    return treeUnite(circles);
  }

  function expandSinglePath(path, gap) {
    const len = path.length;
    if (len <= 0) return path.clone();
    const buffer = buildCircleBuffer(path, gap);
    if (!buffer) return path.clone();
    const result = path.unite(buffer);
    buffer.remove();
    result.simplify(0.05);
    return result;
  }

  /**
   * Import badge SVG shapes, position them, unite, and expand by gap.
   * Returns a single Paper.js Path to use as the cutout (replaces old rectangular notch).
   */
  function importBadgeSilhouette(badgeSvg, tx, ty, scale, gap) {
    const badgeDoc = new DOMParser_().parseFromString(badgeSvg, 'image/svg+xml');
    const badgeSvgEl = badgeDoc.documentElement;

    const paths = [];
    function collectPaths(el, parentTransform) {
      const tag = el.tagName?.toLowerCase();
      if (!tag) return;

      if (tag === 'g' || tag === 'svg') {
        const t = el.getAttribute('transform');
        const combined = parentTransform && t ? `${parentTransform} ${t}` : (t || parentTransform);
        for (const child of Array.from(el.children)) collectPaths(child, combined);
        return;
      }

      // Skip non-visible elements
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      const display = el.getAttribute('display');
      const visibility = el.getAttribute('visibility');
      if (display === 'none' || visibility === 'hidden') return;
      if (fill === 'none' && (!stroke || stroke === 'none')) return;

      const p = svgElToPaperPath(el);
      if (p) {
        if (parentTransform) applyPaperTransform(p, parentTransform);
        paths.push(p);
      }
    }

    collectPaths(badgeSvgEl, null);
    if (paths.length === 0) return null;

    // Unite all shapes into a single path
    let united = paths[0];
    for (let i = 1; i < paths.length; i++) {
      const next = united.unite(paths[i]);
      united.remove();
      paths[i].remove();
      united = next;
    }

    // Apply badge positioning: translate + scale
    const matrix = new paper.Matrix();
    matrix.translate(tx, ty);
    matrix.scale(scale, new paper.Point(0, 0));
    united.transform(matrix);

    // Expand by gap
    const expanded = expandPath(united, gap);
    if (expanded !== united) united.remove();

    return expanded;
  }

  const STYLE_ATTRS = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity'];

  function createStrokeParts(el, sw, parentTransform) {
    const tag = el.tagName.toLowerCase();
    let outer, inner;
    if (tag === 'circle') {
      const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy'), r = +el.getAttribute('r');
      outer = new paper.Path.Circle(new paper.Point(cx, cy), r + sw / 2);
      inner = new paper.Path.Circle(new paper.Point(cx, cy), Math.max(0, r - sw / 2));
    } else if (tag === 'rect') {
      const x = +el.getAttribute('x'), y = +el.getAttribute('y');
      const w = +el.getAttribute('width'), h = +el.getAttribute('height');
      const rx = +(el.getAttribute('rx') || 0);
      const outerRx = rx + sw / 2, innerRx = Math.max(0, rx - sw / 2);
      outer = new paper.Path.Rectangle(
        new paper.Rectangle(x - sw / 2, y - sw / 2, w + sw, h + sw), new paper.Size(outerRx, outerRx));
      inner = new paper.Path.Rectangle(
        new paper.Rectangle(x + sw / 2, y + sw / 2, Math.max(0, w - sw), Math.max(0, h - sw)),
        new paper.Size(innerRx, innerRx));
    } else {
      return null;
    }
    const t = el.getAttribute('transform');
    if (t) { applyPaperTransform(outer, t); applyPaperTransform(inner, t); }
    if (parentTransform) { applyPaperTransform(outer, parentTransform); applyPaperTransform(inner, parentTransform); }
    const ring = outer.subtract(inner);
    outer.remove();
    return { inner, ring };
  }

  function applyModifier(svgString, modifierKey, modifierColor, viewBoxSize, opts) {
    if (!modifierKey || modifierKey === 'none') return svgString;
    const modDef = MODIFIERS[modifierKey];
    if (!modDef) return svgString;

    if (modifierKey !== 'custom' || !opts?.customBadgeSvg) return svgString;

    paperScope.activate();
    const s = viewBoxSize;

    const placement = computeBadgePlacement(
      opts.customBadgeSvg, viewBoxSize,
      opts.badgeXOffset || 0, opts.badgeYOffset || 0, opts.badgeScale ?? 1.0);

    if (!placement.inner) return svgString;

    const gap = opts.badgeGap ?? 0.5;

    // Import badge silhouette and expand by gap to create the cutout shape
    const notch = importBadgeSilhouette(
      opts.customBadgeSvg, placement.tx, placement.ty, placement.scale, gap);

    if (!notch) return svgString;

    const xmlParser = new DOMParser_();
    const doc = xmlParser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.documentElement;

    // Build a clipPath for shapes that can't use boolean subtraction
    const viewBoxRect = new paper.Path.Rectangle(new paper.Rectangle(0, 0, s, s));
    const keepRegion = viewBoxRect.subtract(notch);
    const keepPathData = keepRegion.pathData;
    viewBoxRect.remove();
    keepRegion.remove();

    let clipAdded = false;
    function ensureClipDef() {
      if (clipAdded) return;
      clipAdded = true;
      let defs = svgEl.querySelector('defs');
      if (!defs) {
        defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgEl.insertBefore(defs, svgEl.firstChild);
      }
      const clipPath = doc.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clipPath.setAttribute('id', 'nc');
      const clipEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      clipEl.setAttribute('d', keepPathData);
      clipPath.appendChild(clipEl);
      defs.appendChild(clipPath);
    }

    function processEl(el, parentTransform) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'g') {
        const t = el.getAttribute('transform');
        for (const child of Array.from(el.children)) processEl(child, t);
        if (el.children.length === 0) el.remove();
        return;
      }

      const fillVal = el.getAttribute('fill');
      const isFillNone = fillVal === 'none';
      const strokeColor = el.getAttribute('stroke');
      const strokeWidth = parseFloat(el.getAttribute('stroke-width')) || 0;
      const hasStroke = strokeColor && strokeColor !== 'none' && strokeWidth > 0;
      const isCircleOrRect = tag === 'circle' || tag === 'rect';

      // Stroked paths and fill-none elements use clipPath — stroke-to-fill
      // decomposition via Minkowski is too imprecise for exact shape geometry.
      // Circle/rect strokes use analytical decomposition in the boolean path below.
      if (isFillNone || (tag === 'path' && hasStroke)) {
        ensureClipDef();
        el.setAttribute('clip-path', 'url(#nc)');
        const parent = el.parentNode;
        if (parent.tagName?.toLowerCase() === 'g') {
          const gt = parent.getAttribute('transform');
          if (gt) {
            const existing = el.getAttribute('transform');
            el.setAttribute('transform', existing ? `${gt} ${existing}` : gt);
          }
          parent.parentNode.insertBefore(el, parent);
          if (parent.children.length === 0) parent.remove();
        }
        return;
      }

      const pp = svgElToPaperPath(el);
      if (!pp) return;
      if (parentTransform) applyPaperTransform(pp, parentTransform);

      const parent = el.parentNode;
      const insertionPoint = parent.tagName?.toLowerCase() === 'g' ? parent : null;

      try {
        let strokeEl = null;
        let fillShape = pp;
        if (hasStroke && isCircleOrRect) {
          const parts = createStrokeParts(el, strokeWidth, parentTransform);
          if (parts) {
            fillShape = parts.inner;
            const ringResult = parts.ring.subtract(notch);
            strokeEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            strokeEl.setAttribute('d', ringResult.pathData);
            strokeEl.setAttribute('fill', strokeColor);
            if (ringResult.className === 'CompoundPath')
              strokeEl.setAttribute('fill-rule', 'evenodd');
            ringResult.remove();
            parts.ring.remove();
          }
        }

        const fillResult = fillShape.subtract(notch);
        const fillEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        fillEl.setAttribute('d', fillResult.pathData);
        for (const a of STYLE_ATTRS) {
          if (a === 'stroke' || a === 'stroke-width' || a.startsWith('stroke-')) continue;
          const v = el.getAttribute(a);
          if (v) fillEl.setAttribute(a, v);
        }
        if (fillResult.className === 'CompoundPath')
          fillEl.setAttribute('fill-rule', 'evenodd');
        fillResult.remove();
        if (fillShape !== pp) fillShape.remove();

        if (insertionPoint) {
          if (strokeEl) insertionPoint.parentNode.insertBefore(strokeEl, insertionPoint);
          insertionPoint.parentNode.insertBefore(fillEl, insertionPoint);
          el.remove();
        } else {
          if (strokeEl) parent.insertBefore(strokeEl, el);
          parent.replaceChild(fillEl, el);
        }
      } catch (e) { /* subtraction failed — leave element unchanged */ }
      pp.remove();
    }

    for (const child of Array.from(svgEl.children)) processEl(child, null);
    notch.remove();

    // Add badge rendering
    const badgeMarkup = `<g transform="translate(${+placement.tx.toFixed(3)} ${+placement.ty.toFixed(3)}) scale(${+placement.scale.toFixed(4)})">${placement.inner}</g>`;

    const modDoc = xmlParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${badgeMarkup}</svg>`, 'image/svg+xml');
    for (const child of Array.from(modDoc.documentElement.children))
      svgEl.appendChild(doc.importNode(child, true));

    return new XMLSerializer_().serializeToString(svgEl);
  }

  return { applyModifier };
}

// ── Engine Factory ───────────────────────────────────────────────────

export async function createModifierEngine(paper) {
  if (paper) return createFullEngine(paper);
  return { applyModifier: applyModifierClipPath };
}

// ── Exported for UI guide computation ────────────────────────────────
export { computeBadgePlacement };
