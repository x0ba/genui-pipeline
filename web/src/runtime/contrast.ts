// Text contrast measurement, shared by the install-time audit (headless Chrome,
// web/src/kit/audit.tsx) and the runtime guard around generated slots.

export type RGBA = { r: number; g: number; b: number; a: number };

/** WCAG 2 AA minimums. */
export const AA = 4.5;
export const AA_LARGE = 3;

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (c: RGBA) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);

export function contrast(a: RGBA, b: RGBA) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `top` painted over an opaque `bottom`. */
export const over = (top: RGBA, bottom: RGBA): RGBA => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

/** Contrast of possibly translucent text over an opaque background. */
export const textContrast = (fg: RGBA, bg: RGBA) => contrast(over(fg, bg), bg);

export const hex = (c: RGBA) =>
  `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}${c.a < 1 ? ` at ${Math.round(c.a * 100)}% opacity` : ""}`;

let probe: CanvasRenderingContext2D | null = null;
const parsed = new Map<string, RGBA | null>();

/**
 * Any CSS colour the browser understands (oklch, light-dark() already resolved
 * by getComputedStyle, color-mix, ...) as sRGB. The colour is painted over black
 * and over white so its alpha can be recovered exactly.
 */
export function parseColor(css: string): RGBA | null {
  const key = css.trim();
  if (!key || key === "none" || key.startsWith("url(")) return null;
  const hit = parsed.get(key);
  if (hit !== undefined) return hit;
  probe ??= Object.assign(document.createElement("canvas"), { width: 2, height: 1 }).getContext("2d", { willReadFrequently: true })!;
  probe.globalCompositeOperation = "source-over";
  probe.fillStyle = "#000";
  probe.fillRect(0, 0, 1, 1);
  probe.fillStyle = "#fff";
  probe.fillRect(1, 0, 1, 1);
  probe.fillStyle = "rgb(1, 2, 3)";
  const sentinel = probe.fillStyle;
  probe.fillStyle = key;
  let result: RGBA | null = null;
  if (probe.fillStyle !== sentinel || key.replace(/\s/g, "") === "rgb(1,2,3)") {
    probe.fillRect(0, 0, 2, 1);
    const d = probe.getImageData(0, 0, 2, 1).data;
    const a = 1 - (d[4] - d[0] + d[5] - d[1] + d[6] - d[2]) / (3 * 255);
    result = a <= 0.002 ? { r: 0, g: 0, b: 0, a: 0 } : { r: d[0] / a, g: d[1] / a, b: d[2] / a, a };
  }
  parsed.set(key, result);
  return result;
}

export type TextItem = {
  el: Element;
  text: string;
  /** Visible line boxes, in viewport coordinates. */
  rects: DOMRect[];
  /** Text colour with every opacity up the tree folded into its alpha. */
  fg: RGBA;
  /** Rendered font size in CSS pixels. */
  px: number;
  /** The contrast this text needs. */
  min: number;
};

type Styles = (e: Element) => CSSStyleDeclaration;
export function styleCache(): Styles {
  const cache = new Map<Element, CSSStyleDeclaration>();
  return (e) => {
    let s = cache.get(e);
    if (!s) cache.set(e, (s = getComputedStyle(e)));
    return s;
  };
}

const NOT_RENDERED = "script, style, noscript, template, title, desc, metadata";

function opacityChain(el: Element, cs: Styles) {
  let a = 1;
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) a *= parseFloat(cs(e).opacity) || 0;
  return a;
}

function paintOf(s: CSSStyleDeclaration, prop: "fill" | "color" | "backgroundColor" | "-webkit-text-fill-color") {
  const raw = prop === "-webkit-text-fill-color" ? s.getPropertyValue(prop) : s[prop];
  return parseColor(raw === "currentcolor" || raw === "" ? s.color : raw);
}

function intersect(a: DOMRect, b: DOMRect) {
  const x = Math.max(a.left, b.left);
  const y = Math.max(a.top, b.top);
  return new DOMRect(x, y, Math.max(0, Math.min(a.right, b.right) - x), Math.max(0, Math.min(a.bottom, b.bottom) - y));
}

const length = (v: string | undefined, total: number) => (!v || v === "auto" ? NaN : v.endsWith("%") ? (parseFloat(v) / 100) * total : parseFloat(v));

/**
 * The region an element lets its content paint into: overflow, `clip` and
 * `clip-path: inset()`, which is how visually hidden text is hidden. Other
 * clip-path shapes are treated as unclipped.
 */
function clipBox(e: Element, s: CSSStyleDeclaration): DOMRect | null {
  if (s.display === "contents") return null;
  const r = e.getBoundingClientRect();
  let box: DOMRect | null = e instanceof SVGElement || (s.overflowX === "visible" && s.overflowY === "visible") ? null : r;
  const inset = s.clipPath.match(/^inset\(([^)]*?)(?:\s+round\s[^)]*)?\)$/);
  if (inset) {
    const [t, rt = t, b = t, l = rt] = inset[1].trim().split(/\s+/);
    const top = length(t, r.height) || 0;
    const left = length(l, r.width) || 0;
    const c = new DOMRect(r.left + left, r.top + top, Math.max(0, r.width - left - (length(rt, r.width) || 0)), Math.max(0, r.height - top - (length(b, r.height) || 0)));
    box = box ? intersect(box, c) : c;
  }
  const rect = s.clip.match(/^rect\((.*)\)$/);
  if (rect && (s.position === "absolute" || s.position === "fixed")) {
    const [t, rt, b, l] = rect[1].split(/\s*,\s*|\s+/);
    const top = length(t, r.height) || 0;
    const left = length(l, r.width) || 0;
    const right = Number.isNaN(length(rt, r.width)) ? r.width : length(rt, r.width);
    const bottom = Number.isNaN(length(b, r.height)) ? r.height : length(b, r.height);
    const c = new DOMRect(r.left + left, r.top + top, Math.max(0, right - left), Math.max(0, bottom - top));
    box = box ? intersect(box, c) : c;
  }
  return box;
}

/** Every piece of visible text under `root`, grouped by the element that owns it. */
export function textItems(root: Element, cs: Styles = styleCache()): TextItem[] {
  const groups = new Map<Element, Text[]>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const el = t.parentElement;
    if (!el || !t.data.trim() || el.closest(NOT_RENDERED)) continue;
    const list = groups.get(el);
    if (list) list.push(t);
    else groups.set(el, [t]);
  }

  const items: TextItem[] = [];
  for (const [el, texts] of groups) {
    const s = cs(el);
    if (s.visibility !== "visible") continue;
    // WCAG exempts inactive controls.
    if (el.closest(":disabled, [aria-disabled='true'], [inert]")) continue;
    const svg = el instanceof SVGElement;
    const color = paintOf(s, svg ? "fill" : "-webkit-text-fill-color");
    if (!color) continue;
    const alpha = color.a * (svg ? parseFloat(s.fillOpacity) : 1) * opacityChain(el, cs);
    if (alpha <= 0) continue;

    let rects: DOMRect[] = [];
    if (svg) rects = [el.getBoundingClientRect()];
    else
      for (const t of texts) {
        const range = document.createRange();
        range.selectNodeContents(t);
        rects.push(...range.getClientRects());
      }
    for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
      const clip = clipBox(a, cs(a));
      if (clip) rects = rects.map((r) => intersect(r, clip));
    }
    rects = rects.filter((r) => r.width >= 2 && r.height >= 2);
    if (!rects.length) continue;

    const ctm = svg ? (el as SVGGraphicsElement).getScreenCTM?.() : null;
    const px = parseFloat(s.fontSize) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    items.push({
      el,
      text: texts.map((t) => t.data).join("").replace(/\s+/g, " ").trim().slice(0, 60),
      rects,
      fg: { ...color, a: alpha },
      px,
      min: px >= 24 || (bold && px >= 18.66) ? AA_LARGE : AA,
    });
  }
  return items;
}

// ---------------------------------------------------------------- runtime guard

const SHAPES = new Set(["rect", "circle", "ellipse", "path", "polygon", "polyline"]);

function layerAt(e: Element, cs: Styles): RGBA | null {
  const s = cs(e);
  const svg = e instanceof SVGElement;
  if (svg && !SHAPES.has(e.localName) && e.localName !== "svg") return null;
  const c = paintOf(s, svg && e.localName !== "svg" ? "fill" : "backgroundColor");
  if (!c || c.a === 0) return null;
  return { ...c, a: c.a * (svg && e.localName !== "svg" ? parseFloat(s.fillOpacity) : 1) * opacityChain(e, cs) };
}

/** What is painted under the point, from the DOM rather than pixels. */
function backdropAt(x: number, y: number, base: RGBA, cs: Styles): RGBA {
  const layers: RGBA[] = [];
  for (const e of document.elementsFromPoint(x, y)) {
    if (e instanceof SVGTextContentElement) continue;
    const c = layerAt(e, cs);
    if (!c) continue;
    layers.push(c);
    if (c.a >= 0.999) break;
  }
  return layers.reduceRight((acc, c) => over(c, acc), base);
}

function backdrops(item: TextItem, base: RGBA, cs: Styles): RGBA[] {
  const out: RGBA[] = [];
  for (const r of item.rects)
    for (const fx of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      out.push(backdropAt(x, y, base, cs));
    }
  return out;
}

const PROBE_ATTR = "data-contrast-probe";
let probeStyle: HTMLStyleElement | null = null;

function resolveToken(host: Element, css: string) {
  const span = document.createElement("span");
  span.style.color = css;
  host.appendChild(span);
  const c = parseColor(getComputedStyle(span).color);
  span.remove();
  return c;
}

/**
 * Recolour any text under `root` that falls below WCAG AA against what is drawn
 * behind it, choosing the theme's text or surface colour, whichever reads.
 * Returns the labels it changed.
 */
export function repairContrast(root: HTMLElement): string[] {
  if (!probeStyle) {
    probeStyle = document.createElement("style");
    // Hit-testing skips pointer-events: none, which would hide shapes under labels.
    probeStyle.textContent = `[${PROBE_ATTR}] * { pointer-events: auto !important; }`;
    document.head.appendChild(probeStyle);
  }
  root.setAttribute(PROBE_ATTR, "");
  const cs = styleCache();
  const host = root.closest(".vbg-report") ?? document.body;
  const base = paintOf(cs(host), "backgroundColor");
  const page = base && base.a > 0.999 ? base : { r: 255, g: 255, b: 255, a: 1 };
  const inks: [string, RGBA | null][] = [
    ["var(--vbg-text-primary)", resolveToken(root, "var(--vbg-text-primary)")],
    ["var(--vbg-surface-primary)", resolveToken(root, "var(--vbg-surface-primary)")],
    ["#000", { r: 0, g: 0, b: 0, a: 1 }],
    ["#fff", { r: 255, g: 255, b: 255, a: 1 }],
  ];

  const changed: string[] = [];
  try {
    for (const item of textItems(root, cs)) {
      const bgs = backdrops(item, page, cs);
      if (!bgs.length || Math.min(...bgs.map((bg) => textContrast(item.fg, bg))) >= item.min) continue;
      const scored = inks
        .filter((ink): ink is [string, RGBA] => ink[1] !== null)
        .map(([css, c]) => [css, Math.min(...bgs.map((bg) => contrast(c, bg)))] as const);
      const pick = scored.find(([, ratio]) => ratio >= item.min) ?? scored.reduce((a, b) => (b[1] > a[1] ? b : a));
      const el = item.el as HTMLElement | SVGElement;
      const s = cs(el);
      if (el instanceof SVGElement) {
        el.style.setProperty("fill", pick[0], "important");
        el.style.setProperty("fill-opacity", "1", "important");
      } else {
        el.style.setProperty("color", pick[0], "important");
        if (s.getPropertyValue("-webkit-text-fill-color") !== s.color) el.style.setProperty("-webkit-text-fill-color", pick[0], "important");
      }
      el.style.setProperty("opacity", "1", "important");
      changed.push(item.text);
    }
  } finally {
    root.removeAttribute(PROBE_ATTR);
  }
  return changed;
}

/** Keep `root` legible as it re-renders, scrolls into view, resizes or changes theme. */
export function watchContrast(root: HTMLElement, name: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = 0;
  const run = () => {
    observer.disconnect();
    try {
      const changed = repairContrast(root);
      if (changed.length)
        console.warn(`[contrast] ${name}: recoloured ${changed.length} low-contrast label(s): ${changed.slice(0, 5).map((t) => JSON.stringify(t)).join(", ")}`);
    } finally {
      observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
      first = 0;
    }
  };
  // Trailing debounce so animations settle first, but never starve for long.
  const schedule = () => {
    const now = performance.now();
    first ||= now;
    clearTimeout(timer);
    timer = setTimeout(run, now - first > 500 ? 0 : 120);
  };
  const observer = new MutationObserver(schedule);
  const resize = new ResizeObserver(schedule);
  if (root.parentElement) resize.observe(root.parentElement);
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", schedule);
  addEventListener("scroll", schedule, { capture: true, passive: true });
  schedule();
  return () => {
    clearTimeout(timer);
    observer.disconnect();
    resize.disconnect();
    scheme.removeEventListener("change", schedule);
    removeEventListener("scroll", schedule, { capture: true });
  };
}
