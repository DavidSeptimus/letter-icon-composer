/**
 * Letter Icon Composer — Modifier Engine
 * Shared Paper.js-based modifier processing for both browser UI and CLI.
 *
 * Applies badge silhouette cutouts (configurable anchor points) to SVG shapes and
 * renders custom badge icons in the freed areas. Supports multiple layered badges
 * applied sequentially — later badges clip through everything below them.
 *
 * When Paper.js is available: boolean path subtraction using expanded badge
 * silhouette. Strokes are expanded into filled outlines via PaperOffset
 * (equivalent to Affinity Designer's "Expand Stroke") before subtraction.
 * ClipPath only as error fallback.
 *
 * When Paper.js is unavailable: pure clipPath fallback (no dependencies).
 */

import { MODIFIERS } from './core.js';

// ── Anchor Points ────────────────────────────────────────────────────

const ANCHOR_POINTS = {
  tl: { ax: 0,   ay: 0   },
  t:  { ax: 0.5, ay: 0   },
  tr: { ax: 1,   ay: 0   },
  l:  { ax: 0,   ay: 0.5 },
  c:  { ax: 0.5, ay: 0.5 },
  r:  { ax: 1,   ay: 0.5 },
  bl: { ax: 0,   ay: 1   },
  b:  { ax: 0.5, ay: 1   },
  br: { ax: 1,   ay: 1   },
};

// ── Badge Placement ──────────────────────────────────────────────────

/**
 * Computes badge placement (position, scale, inner SVG content).
 * Used by both the full engine (for silhouette import + rendering) and
 * the clipPath fallback (for rendering only).
 */
function computeBadgePlacement(badgeSvg, viewBoxSize, xOff, yOff, userScale, anchor = 'br') {
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

  // Anchor-based alignment: align badge's anchor point to viewBox's matching point
  const { ax, ay } = ANCHOR_POINTS[anchor] || ANCHOR_POINTS.br;
  const scaledW = badgeW * scale;
  const scaledH = badgeH * scale;
  const vbAnchorX = ax * viewBoxSize;
  const vbAnchorY = ay * viewBoxSize;
  const badgeAnchorX = ax * scaledW;
  const badgeAnchorY = ay * scaledH;
  const tx = vbAnchorX - badgeAnchorX - minX * scale + xOff;
  const ty = vbAnchorY - badgeAnchorY - minY * scale + yOff;

  // Extract inner content between <svg...> and </svg>
  const innerMatch = badgeSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  const inner = innerMatch ? innerMatch[1].trim() : '';

  return { tx, ty, scale, inner, minX, minY, badgeW, badgeH };
}

// ── Normalize Badges ─────────────────────────────────────────────────

/**
 * Normalizes opts into a badges array. Supports:
 * - opts.badges: array of { svgText, xOffset, yOffset, scale, gap, anchor }
 * - Legacy opts.customBadgeSvg: single badge wrapped into array
 * Returns empty array if no badges configured.
 */
function normalizeBadges(opts) {
  if (!opts) return [];
  if (Array.isArray(opts.badges) && opts.badges.length > 0) return opts.badges;
  if (opts.customBadgeSvg) {
    return [{
      svgText: opts.customBadgeSvg,
      xOffset: opts.badgeXOffset || 0,
      yOffset: opts.badgeYOffset || 0,
      scale: opts.badgeScale ?? 1.0,
      gap: opts.badgeGap ?? 1,
      anchor: opts.badgeAnchor || 'br',
    }];
  }
  return [];
}

// ── ClipPath-Only Fallback (no dependencies) ─────────────────────────

function applySingleBadgeClipPath(svgString, viewBoxSize, badge, index) {
  const placement = computeBadgePlacement(
    badge.svgText, viewBoxSize,
    badge.xOffset || 0, badge.yOffset || 0, badge.scale ?? 1.0,
    badge.anchor || 'br');

  if (!placement.inner) return svgString;

  const s = viewBoxSize;
  const { tx, ty, scale, badgeW, badgeH, minX, minY } = placement;
  const gap = badge.gap ?? 1;

  // Badge bounding rect in output coordinates, expanded by gap
  const bx = tx + minX * scale - gap;
  const by = ty + minY * scale - gap;
  const bw = badgeW * scale + gap * 2;
  const bh = badgeH * scale + gap * 2;

  // keepRegion = full viewBox minus badge bbox
  const keepPath = `M0 0H${s}V${s}H0Z M${bx} ${by}H${bx + bw}V${by + bh}H${bx}Z`;

  const badgeMarkup = `<g transform="translate(${+tx.toFixed(3)} ${+ty.toFixed(3)}) scale(${+scale.toFixed(4)})">${placement.inner}</g>`;

  const clipId = `nc-${index}`;
  const clipDef = `<defs><clipPath id="${clipId}"><path d="${keepPath}" fill-rule="evenodd"/></clipPath></defs>`;
  svgString = svgString.replace(/(<svg[^>]*>)/, `$1${clipDef}<g clip-path="url(#${clipId})">`);
  svgString = svgString.replace('</svg>', `</g>${badgeMarkup}</svg>`);
  return svgString;
}

function applyModifierClipPath(svgString, modifierKey, modifierColor, viewBoxSize, opts) {
  if (!modifierKey || modifierKey === 'none') return svgString;
  const modDef = MODIFIERS[modifierKey];
  if (!modDef) return svgString;

  const badges = normalizeBadges(opts);
  if (badges.length === 0) return svgString;

  let result = svgString;
  for (let i = 0; i < badges.length; i++) {
    result = applySingleBadgeClipPath(result, viewBoxSize, badges[i], i);
  }
  return result;
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

  // PaperOffset for stroke expansion and path offsetting
  let PaperOffset;
  if (typeof globalThis.PaperOffset !== 'undefined') {
    PaperOffset = globalThis.PaperOffset;
  } else {
    PaperOffset = (await import('paperjs-offset')).PaperOffset;
  }

  const paperScope = new paper.PaperScope();
  paperScope.setup(new paper.Size(1, 1));

  function applyPaperTransform(pp, transformStr) {
    const transforms = [];
    const re = /(translate|scale|rotate|matrix|skewX|skewY)\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(transformStr)) !== null)
      transforms.push({ type: m[1], nums: m[2].split(/[\s,]+/).map(Number) });
    for (let i = transforms.length - 1; i >= 0; i--) {
      const { type, nums } = transforms[i];
      if (type === 'translate') pp.translate(new paper.Point(nums[0], nums[1] || 0));
      else if (type === 'scale') pp.scale(nums[0], nums[1] ?? nums[0], new paper.Point(0, 0));
      else if (type === 'rotate') pp.rotate(nums[0], new paper.Point(nums[1] || 0, nums[2] || 0));
      else if (type === 'matrix') pp.transform(new paper.Matrix(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]));
      else if (type === 'skewX') pp.transform(new paper.Matrix(1, 0, Math.tan(nums[0] * Math.PI / 180), 1, 0, 0));
      else if (type === 'skewY') pp.transform(new paper.Matrix(1, Math.tan(nums[0] * Math.PI / 180), 0, 1, 0, 0));
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
      if (!p) return;
      if (parentTransform) applyPaperTransform(p, parentTransform);

      const sw = parseFloat(el.getAttribute('stroke-width')) || 0;
      const hasStroke = stroke && stroke !== 'none' && sw > 0;
      const isFillNone = fill === 'none';

      if (hasStroke) {
        const joinStyle = el.getAttribute('stroke-linejoin') === 'round' ? 'round' : 'miter';

        if (p.closed) {
          // Closed stroked path: expand outward by sw/2 to get the outer boundary
          // as a filled path (includes interior). This ensures the full enclosed
          // area is part of the silhouette, not just the stroke ring.
          const outer = PaperOffset.offset(p, sw / 2, { join: joinStyle, insert: false });
          p.remove();
          if (outer) paths.push(outer);
        } else {
          // Open path: offsetStroke to get the stroke area as a filled shape
          const capStyle = el.getAttribute('stroke-linecap') === 'round' ? 'round' : 'butt';
          const strokeOutline = PaperOffset.offsetStroke(p, sw / 2, {
            join: joinStyle, cap: capStyle, insert: false
          });
          p.remove();
          if (strokeOutline) paths.push(strokeOutline);
        }
      } else {
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

    // Expand by gap using PaperOffset
    if (gap > 0) {
      const expanded = PaperOffset.offset(united, gap, { join: 'round', insert: false });
      united.remove();
      return expanded;
    }

    return united;
  }

  const STYLE_ATTRS = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity'];

  /**
   * Apply a single badge's cutout + rendering to the SVG string via Paper.js boolean ops.
   * Returns the modified SVG string.
   */
  function applySingleBadgePaper(svgString, viewBoxSize, badge, index) {
    paperScope.activate();
    const s = viewBoxSize;

    const placement = computeBadgePlacement(
      badge.svgText, viewBoxSize,
      badge.xOffset || 0, badge.yOffset || 0, badge.scale ?? 1.0,
      badge.anchor || 'br');

    if (!placement.inner) return svgString;

    const gap = badge.gap ?? 1;

    // Import badge silhouette and expand by gap to create the cutout shape
    const notch = importBadgeSilhouette(
      badge.svgText, placement.tx, placement.ty, placement.scale, gap);

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

    const clipId = `nc-${index}`;
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
      clipPath.setAttribute('id', clipId);
      const clipEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      clipEl.setAttribute('d', keepPathData);
      clipPath.appendChild(clipEl);
      defs.appendChild(clipPath);
    }

    function processEl(el, parentTransform) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'defs') return; // Skip defs from previous iterations
      if (tag === 'g') {
        if (el.hasAttribute('data-badge-layer')) {
          // Previous badge rendering — clip with silhouette cutout rather than
          // boolean-subtracting individual paths (which would lose fill-rule
          // semantics and corrupt complex badge SVG content).
          // Always wrap in a transform-free <g> so the clip-path coordinates
          // are interpreted in the root SVG coordinate system, not the badge
          // layer's transformed local coordinates.
          ensureClipDef();
          const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
          wrapper.setAttribute('clip-path', `url(#${clipId})`);
          el.parentNode.insertBefore(wrapper, el);
          wrapper.appendChild(el);
          return;
        }
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

      const pp = svgElToPaperPath(el);
      if (!pp) return;
      if (parentTransform) applyPaperTransform(pp, parentTransform);

      const parent = el.parentNode;
      const insertionPoint = parent.tagName?.toLowerCase() === 'g' ? parent : null;

      try {
        let fillEl = null;
        let strokeEl = null;

        if (hasStroke) {
          // Expand stroke into a filled outline using PaperOffset.offsetStroke,
          // then subtract the notch from it. Works for all path types.
          const joinStyle = el.getAttribute('stroke-linejoin') === 'round' ? 'round' : 'miter';
          const capStyle = el.getAttribute('stroke-linecap') === 'round' ? 'round' : 'butt';
          const strokeOutline = PaperOffset.offsetStroke(pp, strokeWidth / 2, {
            join: joinStyle, cap: capStyle, insert: false
          });

          if (strokeOutline) {
            if (!isFillNone) {
              const fillResult = pp.subtract(notch);
              fillEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
              fillEl.setAttribute('d', fillResult.pathData);
              for (const a of STYLE_ATTRS) {
                if (a === 'stroke' || a === 'stroke-width' || a.startsWith('stroke-')) continue;
                // Skip fill-rule/clip-rule — Paper.js boolean results use nonzero winding
                if (a === 'fill-rule' || a === 'clip-rule') continue;
                const v = el.getAttribute(a);
                if (v) fillEl.setAttribute(a, v);
              }
              fillResult.remove();
            }

            const ringResult = strokeOutline.subtract(notch);
            strokeEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            strokeEl.setAttribute('d', ringResult.pathData);
            strokeEl.setAttribute('fill', strokeColor);
            ringResult.remove();
            strokeOutline.remove();
          }
        } else if (!isFillNone) {
          // Fill only, no stroke — subtract notch directly
          const fillResult = pp.subtract(notch);
          fillEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          fillEl.setAttribute('d', fillResult.pathData);
          for (const a of STYLE_ATTRS) {
            if (a === 'stroke' || a === 'stroke-width' || a.startsWith('stroke-')) continue;
            // Skip fill-rule/clip-rule — Paper.js boolean results use nonzero winding
            if (a === 'fill-rule' || a === 'clip-rule') continue;
            const v = el.getAttribute(a);
            if (v) fillEl.setAttribute(a, v);
          }
          fillResult.remove();
        }

        // Replace original element with new fill/stroke paths.
        if (insertionPoint) {
          if (fillEl) insertionPoint.parentNode.insertBefore(fillEl, insertionPoint);
          if (strokeEl) insertionPoint.parentNode.insertBefore(strokeEl, insertionPoint);
          el.remove();
        } else {
          if (fillEl) parent.insertBefore(fillEl, el);
          if (strokeEl) parent.insertBefore(strokeEl, el);
          el.remove();
        }
      } catch (e) {
        // Boolean subtraction failed — fall back to clipPath
        ensureClipDef();
        el.setAttribute('clip-path', `url(#${clipId})`);
        if (insertionPoint) {
          const gt = insertionPoint.getAttribute('transform');
          if (gt) {
            const existing = el.getAttribute('transform');
            el.setAttribute('transform', existing ? `${gt} ${existing}` : gt);
          }
          insertionPoint.parentNode.insertBefore(el, insertionPoint);
          if (insertionPoint.children.length === 0) insertionPoint.remove();
        }
      }
      pp.remove();
    }

    for (const child of Array.from(svgEl.children)) processEl(child, null);
    notch.remove();

    // Add badge rendering (data-badge-layer lets later iterations clip rather than boolean-subtract)
    const badgeMarkup = `<g data-badge-layer="${index}" transform="translate(${+placement.tx.toFixed(3)} ${+placement.ty.toFixed(3)}) scale(${+placement.scale.toFixed(4)})">${placement.inner}</g>`;

    const modDoc = xmlParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${badgeMarkup}</svg>`, 'image/svg+xml');
    for (const child of Array.from(modDoc.documentElement.children))
      svgEl.appendChild(doc.importNode(child, true));

    return new XMLSerializer_().serializeToString(svgEl);
  }

  function applyModifier(svgString, modifierKey, modifierColor, viewBoxSize, opts) {
    if (!modifierKey || modifierKey === 'none') return svgString;
    const modDef = MODIFIERS[modifierKey];
    if (!modDef) return svgString;

    const badges = normalizeBadges(opts);
    if (badges.length === 0) return svgString;

    let result = svgString;
    for (let i = 0; i < badges.length; i++) {
      result = applySingleBadgePaper(result, viewBoxSize, badges[i], i);
    }
    return result;
  }

  return { applyModifier };
}

// ── Engine Factory ───────────────────────────────────────────────────

export async function createModifierEngine(paper) {
  if (paper) return createFullEngine(paper);
  return { applyModifier: applyModifierClipPath };
}

// ── Exported for UI guide computation ────────────────────────────────
export { computeBadgePlacement, ANCHOR_POINTS };
