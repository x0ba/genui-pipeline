import { HOST_GLOBAL, type Fixture, type ModuleHost } from "@malleable/core";
import { hex, luminance, parseColor, repairContrast, styleCache, textContrast, textItems, type RGBA, type TextItem } from "@malleable/core/contrast";
import { Component, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

// Runs inside headless Chrome during verification (chrome.ts drives it). It
// loads the compiled component the way the app will, renders it on the
// "server" with renderToString and on the client with the real stylesheets,
// then measures every piece of text against the pixels painted behind it.
// Generated code never runs in the server process.

/** `severity` orders findings of one kind, worst first (lowest contrast, smallest text). */
export type Finding = { kind: "render" | "contrast" | "ignored-fill" | "overlap" | "tiny"; message: string; severity?: number };

type Provider = ComponentType<{ fixture: Fixture; children: ReactNode }>;
type Slot = ComponentType<Record<string, unknown>>;

/** Text smaller than this at desktop width is unreadable regardless of colour. */
const MIN_PX = 10;
const HIDE_TEXT = "data-audit-hide-text";

let failure: string | null = null;
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    failure = error.message;
    return { error };
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}

function settle(maxMs = 3000) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    let last = start;
    const mo = new MutationObserver(() => (last = performance.now()));
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      const idle = now - last > 200 && document.getAnimations().every((a) => a.playState !== "running");
      if (idle || now - start > maxMs) {
        mo.disconnect();
        resolve();
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function interactives(mount: Element) {
  return [
    ...mount.querySelectorAll<Element>(
      "button:not(:disabled), a[href], summary, input[type=checkbox], input[type=radio], [role=button], [role=tab], [role=option], [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** A `fill` attribute on SVG text that the stylesheet silently overrides. */
function ignoredFills(mount: Element): Finding[] {
  const out: Finding[] = [];
  for (const el of mount.querySelectorAll<SVGElement>("text[fill], tspan[fill], textPath[fill]")) {
    if (el.style.fill) continue;
    const attr = el.getAttribute("fill")!;
    const actual = getComputedStyle(el).fill;
    el.style.fill = attr;
    const wanted = getComputedStyle(el).fill;
    el.style.removeProperty("fill");
    const a = parseColor(actual);
    const w = parseColor(wanted);
    if (a && w && Math.abs(luminance(a) - luminance(w)) > 0.01)
      out.push({
        kind: "ignored-fill",
        message: `<${el.localName}> "${(el.textContent ?? "").trim().slice(0, 40)}" sets fill="${attr}", but the stylesheet overrides the fill attribute of SVG text, so it renders as ${hex(a)}. Set text colour with style={{ fill: ... }}.`,
      });
  }
  return out;
}

function overlaps(items: TextItem[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  const list = items.slice(0, 400);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      for (const ra of a.rects)
        for (const rb of b.rects) {
          const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (w <= 0 || h <= 0) continue;
          if (w * h < 0.3 * Math.min(ra.width * ra.height, rb.width * rb.height)) continue;
          const key = `${a.text}|${b.text}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ kind: "overlap", message: `text "${a.text}" is drawn on top of text "${b.text}"` });
        }
    }
  return out;
}

function decode(b64: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = () => reject(new Error("screenshot did not decode"));
    img.src = `data:image/png;base64,${b64}`;
  });
}

/** The darkest and lightest colours (10th and 90th percentile) behind a line of text. */
function backgroundsIn(img: ImageData, r: DOMRect): RGBA[] {
  const x0 = Math.max(0, Math.floor(r.left));
  const y0 = Math.max(0, Math.floor(r.top));
  const x1 = Math.min(img.width, Math.ceil(r.right));
  const y1 = Math.min(img.height, Math.ceil(r.bottom));
  if (x1 <= x0 || y1 <= y0) return [];
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
  const px: RGBA[] = [];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4;
      px.push({ r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]!, a: 1 });
    }
  px.sort((a, b) => luminance(a) - luminance(b));
  const lo = px[Math.floor(px.length * 0.1)]!;
  const hi = px[Math.min(px.length - 1, Math.floor(px.length * 0.9))]!;
  return lo === hi ? [lo] : [lo, hi];
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;|&#\d+;/g, " ").trim();

export function mount({ modules, Provider }: { modules: Record<string, unknown>; Provider: Provider }) {
  const host: ModuleHost = {
    require(specifier) {
      if (!(specifier in modules)) throw new Error(`module '${specifier}' is not provided by the host`);
      return modules[specifier];
    },
  };
  (globalThis as Record<string, unknown>)[HOST_GLOBAL] = host;

  const root = document.querySelector<HTMLElement>("[data-malleable-root]")!;
  const target = document.querySelector<HTMLElement>("[data-malleable-mount]")!;
  const react = createRoot(target);
  let Slot: Slot | null = null;
  let key = 0;
  let theme: [string, string] | null = null;
  let pending: { items: TextItem[]; static: Finding[]; restore: (() => void)[] } | null = null;

  const element = (props: Record<string, unknown>, fixture: Fixture) => (
    <Boundary key={++key}>
      <Provider fixture={fixture}>{Slot && <Slot {...props} />}</Provider>
    </Boundary>
  );

  const api: HarnessApi = {
    /** Import the compiled module. Returns an error, or null. */
    async load(code: string) {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      try {
        const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
        const C = mod.default;
        if (typeof C !== "function" && !(typeof C === "object" && C && "$$typeof" in C))
          return "the module must `export default` a React function component";
        Slot = C as Slot;
        return null;
      } catch (e) {
        return `module failed to load: ${(e as Error).message}`;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    /** Render with renderToString, as a server would. Returns an error, or null. */
    ssr(props: Record<string, unknown>, fixture: Fixture) {
      failure = null;
      try {
        const html = renderToString(element(props, fixture));
        if (failure) return `threw while rendering on the server: ${failure}`;
        if (visibleText(html).length < 10) return "rendered no visible text; include labels or a text alternative";
        return null;
      } catch (e) {
        return `threw while rendering on the server: ${(e as Error).message}`;
      }
    },
    async render(props: Record<string, unknown>, fixture: Fixture) {
      failure = null;
      react.render(element(props, fixture));
      await settle();
      scrollTo(0, 0);
      return failure;
    },
    height: () => document.documentElement.scrollHeight,
    interactiveCount: () => interactives(target).length,
    /** The i-th control, for the driver to click with a real, trusted input event. */
    interactive: (i: number) => interactives(target)[i] ?? null,
    label(i: number) {
      const el = interactives(target)[i];
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? el.localName).trim().slice(0, 40) : null;
    },
    settle: async () => {
      await settle();
      scrollTo(0, 0);
    },
    /**
     * Apply a theme, measure text, then hide it so the next screenshot shows
     * only what is behind it. `repair` first applies the runtime guard, as the
     * app does around generated slots.
     */
    async prepare(attribute: [string, string] | null, checkSize: boolean, repair: boolean, inks: string[]) {
      if (theme) root.removeAttribute(theme[0]);
      theme = attribute;
      if (attribute) root.setAttribute(attribute[0], attribute[1]);
      await frames();
      if (repair) {
        repairContrast(target, inks);
        await frames();
      }
      const items = textItems(target, styleCache());
      const found: Finding[] = [...ignoredFills(target), ...overlaps(items)];
      if (checkSize)
        for (const it of items)
          if (it.px < MIN_PX)
            found.push({ kind: "tiny", message: `text "${it.text}" renders at ${it.px.toFixed(1)}px; the minimum is ${MIN_PX}px`, severity: it.px });
      // Inline and important, so no inline style on the component can keep text visible.
      const restore = items.map(({ el }) => {
        const style = (el as HTMLElement | SVGElement).style;
        const prop = el instanceof SVGElement ? "visibility" : "-webkit-text-fill-color";
        const before = [style.getPropertyValue(prop), style.getPropertyPriority(prop)] as const;
        style.setProperty(prop, el instanceof SVGElement ? "hidden" : "transparent", "important");
        return () => style.setProperty(prop, ...before);
      });
      pending = { items, static: found, restore };
      root.setAttribute(HIDE_TEXT, "");
      await frames();
    },
    async inspect(b64: string): Promise<Finding[]> {
      root.removeAttribute(HIDE_TEXT);
      const { items, static: found, restore } = pending!;
      pending = null;
      for (const r of restore) r();
      const img = await decode(b64);
      for (const it of items) {
        let worst: { ratio: number; bg: RGBA } | null = null;
        for (const r of it.rects)
          for (const bg of backgroundsIn(img, r)) {
            const ratio = textContrast(it.fg, bg);
            if (!worst || ratio < worst.ratio) worst = { ratio, bg };
          }
        if (worst && worst.ratio < it.min)
          found.push({
            kind: "contrast",
            message: `text "${it.text}" has contrast ${worst.ratio.toFixed(2)}:1, needs ${it.min}:1 (${hex(it.fg)} on ${hex(worst.bg)})`,
            severity: worst.ratio,
          });
      }
      return found;
    },
  };
  (window as unknown as { __audit: HarnessApi }).__audit = api;
}

export type HarnessApi = {
  load(code: string): Promise<string | null>;
  ssr(props: Record<string, unknown>, fixture: Fixture): string | null;
  render(props: Record<string, unknown>, fixture: Fixture): Promise<string | null>;
  height(): number;
  interactiveCount(): number;
  interactive(i: number): Element | null;
  label(i: number): string | null;
  settle(): Promise<void>;
  prepare(attribute: [string, string] | null, checkSize: boolean, repair: boolean, inks: string[]): Promise<void>;
  inspect(b64: string): Promise<Finding[]>;
};
