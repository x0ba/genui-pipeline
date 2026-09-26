import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { ComponentDef, Subject } from "../../shared/spec";
import { PERSONAS } from "../../shared/personas";
import type { Finding } from "../../web/src/kit/audit";
import { ROOT, RUNTIME, STAGING_DIR } from "../store";

// Install-time legibility audit. The component is bundled for the browser and
// rendered in headless Chrome with the same stylesheets as the app, in both
// themes, for every prop option, for everyone whose role can see it, at desktop
// and phone widths, and after clicking its controls. Every piece of text is
// measured against a screenshot of what is painted behind it.

const BRAND_URL = "https://vercel.com/geist/vercel-brand.css"; // same file web/index.html loads
const BRAND_CACHE = join(RUNTIME, "cache/vercel-brand.css");
const APP_CSS = join(ROOT, "web/src/styles/app.css");
const AUDIT_PAGE = join(ROOT, "web/src/kit/audit.tsx");
const KIT = join(ROOT, "web/src/kit/index.ts");

const DESKTOP = 960;
const PHONE = 380;
const MAX_CLICKS = 6;
const TIMEOUT_MS = 120_000;

type Audit = {
  render(props: Record<string, string>, subject: Subject): Promise<string | null>;
  height(): number;
  interactiveCount(): number;
  click(i: number): Promise<string | null>;
  prepare(theme: "light" | "dark", checkSize: boolean, repair: boolean): Promise<void>;
  inspect(b64: string): Promise<Finding[]>;
};
declare const window: { __audit: Audit };

/** Thrown when the audit itself cannot run; not something the component author can fix. */
export class AuditUnavailable extends Error {}

const MAC_APPS = ["Google Chrome", "Chromium", "Google Chrome Canary", "Microsoft Edge", "Brave Browser"];
const LINUX_BINS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];

export function chromePath(): string | null {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin")
    for (const dir of ["/Applications", join(process.env.HOME ?? "", "Applications")])
      for (const app of MAC_APPS) {
        const path = join(dir, `${app}.app/Contents/MacOS/${app}`);
        if (existsSync(path)) return path;
      }
  for (const bin of LINUX_BINS) {
    const path = Bun.which(bin);
    if (path) return path;
  }
  return null;
}

let browser: Promise<Browser> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

function getBrowser() {
  clearTimeout(idle);
  if (!browser) {
    const executablePath = chromePath();
    if (!executablePath)
      throw new AuditUnavailable("no Chrome or Chromium found for the legibility audit; install Google Chrome or set CHROME_PATH");
    browser = puppeteer
      .launch({
        executablePath,
        headless: true,
        // Screenshots must be plain sRGB so pixels compare with computed colours.
        args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
      })
      .catch((e: Error) => {
        browser = null;
        throw new AuditUnavailable(`Chrome failed to start for the legibility audit: ${e.message}`);
      });
  }
  return browser;
}

function release() {
  clearTimeout(idle);
  idle = setTimeout(async () => {
    const b = browser;
    browser = null;
    await (await b)?.close().catch(() => {});
  }, 60_000);
}

async function brandCss(): Promise<string> {
  const fresh = existsSync(BRAND_CACHE) && Date.now() - statSync(BRAND_CACHE).mtimeMs < 86_400_000;
  if (!fresh) {
    try {
      const res = await fetch(BRAND_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mkdirSync(join(RUNTIME, "cache"), { recursive: true });
      writeFileSync(BRAND_CACHE, await res.text());
    } catch (e) {
      if (!existsSync(BRAND_CACHE)) throw new AuditUnavailable(`could not fetch ${BRAND_URL} for the legibility audit: ${(e as Error).message}`);
    }
  }
  return readFileSync(BRAND_CACHE, "utf8");
}

async function bundle(path: string): Promise<string> {
  const entry = join(STAGING_DIR, `audit-${crypto.randomUUID().slice(0, 8)}.tsx`);
  writeFileSync(entry, `import C from ${JSON.stringify(path)};\nimport { mount } from ${JSON.stringify(AUDIT_PAGE)};\nmount(C);\n`);
  try {
    const out = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      format: "iife",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        {
          name: "kit",
          setup(b) {
            b.onResolve({ filter: /^@kit$/ }, () => ({ path: KIT }));
          },
        },
      ],
    });
    if (!out.success) throw new Error(out.logs.map((l) => l.message).join("\n"));
    return await out.outputs[0].text();
  } finally {
    rmSync(entry, { force: true });
  }
}

const page = (css: string, app: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>${css}</style>
<style>${app}</style>
<style>
  body { margin: 0; }
  [data-audit-hide-text] * { -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
  [data-audit-hide-text] :is(text, tspan, textPath) { visibility: hidden !important; }
</style></head>
<body><div id="root" class="vbg-report" data-theme="light"><div class="vbg-custom-app" style="display:block;min-height:0">
<main class="vbg-custom-main"><section class="vbg-custom-slot"><div id="mount"></div></section></main>
</div></div></body></html>`;

function variants(def: ComponentDef) {
  const defaults = Object.fromEntries(Object.entries(def.props).map(([k, p]) => [k, p.default]));
  const out: Record<string, string>[] = [defaults];
  for (const [key, prop] of Object.entries(def.props))
    for (const option of Object.keys(prop.options)) if (option !== prop.default) out.push({ ...defaults, [key]: option });
  return out;
}

/** The author's subject first, then everyone else whose role can use the component. */
export function subjectsFor(def: ComponentDef, author: Subject): Subject[] {
  const others = PERSONAS.map((p) => p.subject).filter((s) => def.roles.includes(s.kind) && s.id !== author.id);
  const all = [...(def.roles.includes(author.kind) ? [author] : []), ...others];
  return all.length ? all : [author];
}

const nameOf = (s: Subject) => PERSONAS.find((p) => p.subject.id === s.id)?.name ?? s.id;

type Located = Finding & { where: string };

type Options = {
  /** Apply the runtime guard before measuring, to verify it rather than the component. */
  repair?: boolean;
};

async function inspect(p: Page, width: number, where: string, checkSize: boolean, opts: Options): Promise<Located[]> {
  const height = Math.min(8000, Math.max(400, await p.evaluate(() => window.__audit.height())));
  const vp = p.viewport();
  if (vp?.width !== width || vp.height !== height) {
    await p.setViewport({ width, height, deviceScaleFactor: 1 });
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const out: Located[] = [];
  for (const theme of ["light", "dark"] as const) {
    await p.evaluate((t, c, r) => window.__audit.prepare(t, c, r), theme, checkSize, !!opts.repair);
    const shot = await p.screenshot({ encoding: "base64", type: "png" });
    const found = await p.evaluate((b) => window.__audit.inspect(b), shot);
    out.push(...found.map((f) => ({ ...f, where: `${theme} theme, ${where}` })));
  }
  return out;
}

const KINDS: { kind: Finding["kind"]; title: string; fix: string }[] = [
  { kind: "render", title: "Render errors", fix: "" },
  {
    kind: "contrast",
    title: "Text below WCAG AA contrast",
    fix: "Fix: text on a filled mark must use the ink paired with that fill: `const h = heat(t)` from @kit, then `fill={h.fill}` on the mark and `style={{ fill: h.ink }}` on SVG text (or `color: h.ink` in HTML). On plain surfaces use var(--vbg-text-primary) or var(--vbg-text-secondary). On var(--vbg-surface-contrast) use var(--vbg-text-on-contrast). Never put text on series colours or on translucent (opacity/fillOpacity) fills.",
  },
  { kind: "ignored-fill", title: "Text colours the stylesheet overrides", fix: "" },
  {
    kind: "overlap",
    title: "Text drawn over other text",
    fix: "Fix: give labels room (larger cells or rows, fewer ticks, abbreviations) or show them only when they fit.",
  },
  {
    kind: "tiny",
    title: "Text too small to read",
    fix: "Fix: SVG text shrinks with the viewBox. Keep the viewBox near the natural pixel size and set style={{ maxWidth: naturalWidth }} rather than drawing a wide viewBox.",
  },
];
const EXAMPLES = 4;

/** One block per kind: how often it happened, the worst few examples, and how to fix it. */
function report(findings: Located[]): string[] {
  const out: string[] = [];
  for (const { kind, title, fix } of KINDS) {
    const list = findings.filter((f) => f.kind === kind).sort((a, b) => (a.severity ?? 0) - (b.severity ?? 0));
    if (!list.length) continue;
    const states = new Set(list.map((f) => f.where)).size;
    out.push(`${title}: ${list.length} finding${list.length === 1 ? "" : "s"} across ${states} rendered state${states === 1 ? "" : "s"}. Worst:`);
    const seen = new Set<string>();
    for (const f of list) {
      if (seen.has(f.message)) continue;
      seen.add(f.message);
      out.push(`- ${f.message} [${f.where}]`);
      if (seen.size === EXAMPLES) break;
    }
    if (fix) out.push(fix);
  }
  return out;
}

/** A page in its own context: its own window, so it keeps rendering frames alongside the others. */
async function openPage(b: Browser, code: string, html: string): Promise<Page> {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
  await p.setContent(html);
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push((e as Error).message));
  await p.addScriptTag({ content: code });
  if (errors.length) {
    await p.browserContext().close();
    throw new Error(`failed to start in the browser: ${errors[0]}`);
  }
  return p;
}

/** Every prop option for one person; the default also at phone width and, for the author, after clicks. */
async function auditSubject(p: Page, def: ComponentDef, subject: Subject, clicks: boolean, opts: Options): Promise<Located[]> {
  const findings: Located[] = [];
  for (const [vi, props] of variants(def).entries()) {
    const where = `props ${JSON.stringify(props)}, ${nameOf(subject)}'s data`;
    if (p.viewport()?.width !== DESKTOP) await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
    const failed = await p.evaluate((pr, s) => window.__audit.render(pr, s), props, subject);
    if (failed) {
      findings.push({ kind: "render", message: `threw in the browser: ${failed}`, where });
      continue;
    }
    findings.push(...(await inspect(p, DESKTOP, `${where}, ${DESKTOP}px wide`, true, opts)));
    if (vi !== 0) continue;
    findings.push(...(await inspect(p, PHONE, `${where}, ${PHONE}px wide`, false, opts)));
    if (!clicks) continue;
    await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
    await p.evaluate((pr, s) => window.__audit.render(pr, s), props, subject);
    const n = await p.evaluate(() => window.__audit.interactiveCount());
    const count = Math.min(n, MAX_CLICKS);
    for (const i of new Set(Array.from({ length: count }, (_, k) => Math.floor((k * n) / count)))) {
      const label = await p.evaluate((x) => window.__audit.click(x), i);
      if (label !== null) findings.push(...(await inspect(p, DESKTOP, `${where}, after clicking "${label}"`, true, opts)));
    }
  }
  return findings;
}

/**
 * Render the component in a real browser and return legibility errors, or an
 * empty list. Throws AuditUnavailable if the browser or stylesheet is missing.
 */
export async function auditLegibility(path: string, def: ComponentDef, author: Subject, opts: Options = {}): Promise<string[]> {
  const [code, css] = await Promise.all([bundle(path).catch((e: Error) => e), brandCss()]);
  if (code instanceof Error) return [`could not bundle for the browser: ${code.message}`];
  const b = await getBrowser();
  const html = page(css, readFileSync(APP_CSS, "utf8"));
  const pages: Page[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = Promise.all(
      subjectsFor(def, author).map(async (subject, i) => {
        const p = await openPage(b, code, html);
        pages.push(p);
        return auditSubject(p, def, subject, i === 0, opts);
      }),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AuditUnavailable("the legibility audit timed out")), TIMEOUT_MS);
    });
    return report((await Promise.race([run, timeout])).flat());
  } catch (e) {
    if (e instanceof AuditUnavailable) throw e;
    return [(e as Error).message];
  } finally {
    clearTimeout(timer);
    await Promise.all(pages.map((p) => p.browserContext().close().catch(() => {})));
    release();
  }
}

