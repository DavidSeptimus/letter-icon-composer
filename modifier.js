/**
 * Letter Icon Composer — Modifier Engine
 * Shared Paper.js-based modifier processing for both browser UI and CLI.
 *
 * Applies a notch (bottom-right corner cutout) to SVG shapes and renders
 * a modifier badge icon in the freed area.
 *
 * When Paper.js is available: boolean path subtraction + stroke rings for
 * circle/rect, clipPath for path elements.
 *
 * When Paper.js is unavailable: pure clipPath fallback (no dependencies).
 */

import { MODIFIERS } from './core.js';

// ── Shared Helpers ───────────────────────────────────────────────────

function notchParams(viewBoxSize, nw, nh, nr) {
  const s = viewBoxSize;
  const W = nw || 8, H = nh || 8, R = Math.min(nr ?? 2, Math.min(W, H) / 2);
  const left = s - W, top = s - H;
  return { s, W, H, R, left, top };
}

function keepRegionPath(s, left, top, R) {
  const cp1 = +(left + R * 0.44772).toFixed(3);
  const cp2 = +(top + R * 0.44772).toFixed(3);
  return `M0 0H${s}V${top}H${left + R}C${cp1} ${top} ${left} ${cp2} ${left} ${top + R}V${s}H0Z`;
}

function badgeTransform(left, top, W, H) {
  const sx = W / 8, sy = H / 8;
  const needsScale = sx !== 1 || sy !== 1;
  const tx = left - 8 * sx, ty = top - 8 * sy;
  if (!needsScale && tx === 0 && ty === 0) return '';
  return ` transform="translate(${tx} ${ty})${needsScale ? ` scale(${sx} ${sy})` : ''}"`;
}

// ── ClipPath-Only Fallback (no dependencies) ─────────────────────────

function applyModifierClipPath(svgString, modifierKey, modifierColor, viewBoxSize, nw, nh, nr) {
  if (!modifierKey || modifierKey === 'none') return svgString;
  const modDef = MODIFIERS[modifierKey];
  if (!modDef) return svgString;

  const { s, W, H, R, left, top } = notchParams(viewBoxSize, nw, nh, nr);
  const keepPath = keepRegionPath(s, left, top, R);

  // Build modifier badge markup
  let modMarkup = modDef.generate(modifierColor);
  const bt = badgeTransform(left, top, W, H);
  if (bt) modMarkup = `<g${bt}>${modMarkup}</g>`;

  // Insert clipPath + wrapping group via string manipulation (no DOM needed)
  const clipDef = `<defs><clipPath id="nc"><path d="${keepPath}"/></clipPath></defs>`;
  svgString = svgString.replace(/(<svg[^>]*>)/, `$1${clipDef}<g clip-path="url(#nc)">`);
  svgString = svgString.replace('</svg>', `</g>${modMarkup}</svg>`);
  return svgString;
}

// ── Full Paper.js Engine ─────────────────────────────────────────────

async function createFullEngine(paper) {
  // Resolve DOM parser — browser-native or jsdom for Node.js
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
      p = new paper.Path(d);
    } else {
      return null;
    }
    const t = el.getAttribute('transform');
    if (t) applyPaperTransform(p, t);
    return p;
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

  function applyModifier(svgString, modifierKey, modifierColor, viewBoxSize, nw, nh, nr) {
    if (!modifierKey || modifierKey === 'none') return svgString;
    const modDef = MODIFIERS[modifierKey];
    if (!modDef) return svgString;

    paperScope.activate();
    const { s, W, H, R, left, top } = notchParams(viewBoxSize, nw, nh, nr);
    const cp1x = left, cp1y = +(top + R * 0.44772).toFixed(3);
    const cp2x = +(left + R * 0.44772).toFixed(3), cp2y = top;
    const notch = new paper.Path(
      `M${left + R} ${top}H${s}V${s}H${left}V${top + R}C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${left + R} ${top}Z`);

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

      // ClipPath for: stroke-only elements, path elements with stroke,
      // or compound paths (multiple subpaths — boolean ops produce garbage)
      const isCompoundPath = tag === 'path' && (el.getAttribute('d') || '').split(/[Mm]/).length > 2;
      if (isFillNone || (tag === 'path' && hasStroke) || isCompoundPath) {
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

      // Boolean subtraction for: circle/rect (with stroke ring), fill-only paths
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

    // Add modifier badge
    let modMarkup = modDef.generate(modifierColor);
    const bt = badgeTransform(left, top, W, H);
    if (bt) modMarkup = `<g${bt}>${modMarkup}</g>`;

    const modDoc = xmlParser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">${modMarkup}</svg>`, 'image/svg+xml');
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
