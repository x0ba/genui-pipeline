import {
  describeSafePairs,
  guardInks,
  resolveValues,
  variantsOf,
  VerifierUnavailable,
  type DesignContract,
  type Fixture,
  type Verifier,
  type VerifyInput,
} from "@malleable/core";
import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer-core";
import { compile } from "./compile";
import type { Finding, HarnessApi } from "./harness";
import { staticCheck } from "./static";

// Install-time verification in headless Chrome. The compiled component is
// loaded into a page with the app's stylesheets and rendered for every prop
// option, for every fixture whose audience can use it, with renderToString and
// on the client, in every theme, at desktop and phone widths, and after
// clicking its controls. Every piece of text is measured against a screenshot
// of what is painted behind it.

declare const window: { __audit: HarnessApi };

export type ChromeVerifierOptions = {
  /** Browser executable. Defaults to CHROME_PATH, then an installed Chrome, Chromium, Edge or Brave. */
  executablePath?: string;
  desktopWidth?: number;
  phoneWidth?: number;
  maxClicks?: number;
  timeoutMs?: number;
  /** Where remote stylesheets are cached, so verification works offline after the first run. */
  cacheDir?: string;
};

const HARNESS = fileURLToPath(new URL("./harness/index.tsx", import.meta.url));
const DEFAULT_FRAME = `<div data-malleable-root><div data-malleable-mount></div></div>`;

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
  for (const bin of LINUX_BINS)
    for (const dir of (process.env.PATH ?? "").split(":")) {
      const path = join(dir, bin);
      if (dir && existsSync(path)) return path;
    }
  return null;
}

const KINDS = (design: DesignContract): { kind: Finding["kind"]; title: string; fix: string }[] => [
  { kind: "render", title: "Render errors", fix: "" },
  {
    kind: "contrast",
    title: "Text below WCAG AA contrast",
    fix: `Fix: put text only on the safe pairs: ${describeSafePairs(design)}. Never put text on series colours or on translucent (opacity, fillOpacity or translucent colour) fills.${design.contrastAdvice ? ` ${design.contrastAdvice}` : ""}`,
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

type Located = Finding & { where: string };

/** One block per kind: how often it happened, the worst few examples, and how to fix it. */
function report(findings: Located[], design: DesignContract): string[] {
  const out: string[] = [];
  for (const { kind, title, fix } of KINDS(design)) {
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

export type AuditOptions = {
  /** Apply the runtime guard before measuring, to verify the guard rather than the component. */
  repair?: boolean;
};

export function chromeVerifier(options: ChromeVerifierOptions = {}): Verifier & {
  verify(input: VerifyInput, audit?: AuditOptions): Promise<string[]>;
  close(): Promise<void>;
} {
  const DESKTOP = options.desktopWidth ?? 960;
  const PHONE = options.phoneWidth ?? 380;
  const MAX_CLICKS = options.maxClicks ?? 6;
  const TIMEOUT_MS = options.timeoutMs ?? 120_000;

  let browser: Promise<Browser> | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const css = new Map<string, string>();

  const executable = () => options.executablePath ?? chromePath();

  function getBrowser() {
    clearTimeout(idle);
    if (!browser) {
      const executablePath = executable();
      if (!executablePath) throw new VerifierUnavailable("no Chrome or Chromium found for verification; install Google Chrome or set CHROME_PATH");
      browser = puppeteer
        .launch({
          executablePath,
          headless: true,
          // Screenshots must be plain sRGB so pixels compare with computed colours.
          args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
        })
        .catch((e: Error) => {
          browser = null;
          throw new VerifierUnavailable(`Chrome failed to start for verification: ${e.message}`);
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

  async function stylesheet(entry: string): Promise<string> {
    if (!/^https?:\/\//.test(entry)) return readFileSync(entry, "utf8");
    const hit = css.get(entry);
    if (hit) return hit;
    const cached = options.cacheDir ? join(options.cacheDir, `${createHash("sha256").update(entry).digest("hex").slice(0, 16)}.css`) : null;
    const fresh = cached && existsSync(cached) && Date.now() - statSync(cached).mtimeMs < 86_400_000;
    if (fresh) return css.set(entry, readFileSync(cached, "utf8")).get(entry)!;
    try {
      const res = await fetch(entry);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (cached) {
        mkdirSync(options.cacheDir!, { recursive: true });
        writeFileSync(cached, text);
      }
      return css.set(entry, text).get(entry)!;
    } catch (e) {
      if (cached && existsSync(cached)) return readFileSync(cached, "utf8");
      throw new VerifierUnavailable(`could not fetch ${entry} for verification: ${(e as Error).message}`);
    }
  }

  /** The harness page script: React, the kit and the app's fixture provider, bundled for the browser. */
  async function harness(input: VerifyInput): Promise<string> {
    const specifiers = [...new Set(["react", "react/jsx-runtime", ...input.kit.imports])];
    const entry = [
      ...specifiers.map((s, i) => `import * as m${i} from ${JSON.stringify(s)};`),
      `import Provider from ${JSON.stringify(input.fixtureProvider)};`,
      `import { mount } from ${JSON.stringify(HARNESS)};`,
      `mount({ Provider, modules: { ${specifiers.map((s, i) => `${JSON.stringify(s)}: m${i}`).join(", ")} } });`,
    ].join("\n");
    const paths = input.kit.paths ?? {};
    const out = await build({
      stdin: { contents: entry, loader: "tsx", resolveDir: input.kit.root, sourcefile: "harness-entry.tsx" },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      logLevel: "silent",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        {
          name: "kit-paths",
          setup(b) {
            const keys = Object.keys(paths);
            if (!keys.length) return;
            const filter = new RegExp(`^(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})$`);
            b.onResolve({ filter }, (args) => ({ path: paths[args.path]! }));
          },
        },
      ],
    });
    return out.outputFiles[0]!.text;
  }

  function page(styles: string[], design: DesignContract) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
${styles.map((s) => `<style>${s}</style>`).join("\n")}
<style>
  body { margin: 0; }
  [data-audit-hide-text] * { -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }
  [data-audit-hide-text] :is(text, tspan, textPath) { visibility: hidden !important; }
</style></head>
<body>${design.frame ?? DEFAULT_FRAME}</body></html>`;
  }

  /** A page in its own context: its own window, so it keeps rendering frames alongside the others. */
  async function openPage(b: Browser, script: string, html: string, code: string): Promise<Page> {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
    await p.setContent(html);
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push((e as Error).message));
    await p.addScriptTag({ content: script, type: "module" });
    await p.waitForFunction(() => Boolean(window.__audit), { timeout: 10_000 }).catch(() => {});
    if (errors.length) {
      await p.browserContext().close();
      throw new Error(`the verification page failed to start: ${errors[0]}`);
    }
    const failed = await p.evaluate((c) => window.__audit.load(c), code);
    if (failed) {
      await p.browserContext().close();
      throw new Error(failed);
    }
    return p;
  }

  return {
    check: staticCheck,
    compile,
    unavailable: () => (executable() ? null : "no Chrome or Chromium found; install Google Chrome or set CHROME_PATH"),
    async close() {
      clearTimeout(idle);
      const b = browser;
      browser = null;
      await (await b)?.close().catch(() => {});
    },

    async verify(input: VerifyInput, audit: AuditOptions = {}): Promise<string[]> {
      const { def, design } = input;
      const fixtures = input.fixtures;
      if (!fixtures.length) return [`no fixture can use '${def.id}': add a fixture for one of its audiences (${(def.audiences ?? []).join(", ")})`];
      const slot = input.options ? { options: input.options } : null;
      const variants = variantsOf(def, slot).map((keys) => ({ keys, values: resolveValues(def, slot, keys) }));
      const themes = Object.entries(design.themes);
      const inks = guardInks(design);

      const [script, styles] = await Promise.all([harness(input).catch((e: Error) => e), Promise.all(design.stylesheets.map(stylesheet))]);
      if (script instanceof Error) throw new VerifierUnavailable(`the verification page could not be bundled: ${script.message}`);
      const html = page(styles, design);
      const b = await getBrowser();

      async function inspect(p: Page, width: number, where: string, checkSize: boolean): Promise<Located[]> {
        const height = Math.min(8000, Math.max(400, await p.evaluate(() => window.__audit.height())));
        const vp = p.viewport();
        if (vp?.width !== width || vp.height !== height) {
          await p.setViewport({ width, height, deviceScaleFactor: 1 });
          await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        }
        const out: Located[] = [];
        for (const [name, theme] of themes.length ? themes : [["default", {}] as const]) {
          if (theme.colorScheme) await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme.colorScheme }]);
          await p.evaluate((a, c, r, i) => window.__audit.prepare(a, c, r, i), theme.attribute ?? null, checkSize, !!audit.repair, inks);
          const shot = await p.screenshot({ encoding: "base64", type: "png" });
          const found = await p.evaluate((s) => window.__audit.inspect(s), shot);
          out.push(...found.map((f) => ({ ...f, where: `${name} theme, ${where}` })));
        }
        return out;
      }

      /** Every variant for one fixture; the default also at phone width and, for the author, after clicks. */
      async function auditFixture(p: Page, fixture: Fixture, clicks: boolean): Promise<Located[]> {
        const findings: Located[] = [];
        for (const [vi, { keys, values }] of variants.entries()) {
          const where = `props ${JSON.stringify(keys)}, ${fixture.name}'s data`;
          const ssr = await p.evaluate((v, f) => window.__audit.ssr(v, f), values, fixture);
          if (ssr) {
            findings.push({ kind: "render", message: ssr, where });
            continue;
          }
          if (p.viewport()?.width !== DESKTOP) await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
          const failed = await p.evaluate((v, f) => window.__audit.render(v, f), values, fixture);
          if (failed) {
            findings.push({ kind: "render", message: `threw in the browser: ${failed}`, where });
            continue;
          }
          findings.push(...(await inspect(p, DESKTOP, `${where}, ${DESKTOP}px wide`, true)));
          if (vi !== 0) continue;
          findings.push(...(await inspect(p, PHONE, `${where}, ${PHONE}px wide`, false)));
          if (!clicks) continue;
          await p.setViewport({ width: DESKTOP, height: 1200, deviceScaleFactor: 1 });
          await p.evaluate((v, f) => window.__audit.render(v, f), values, fixture);
          const n = await p.evaluate(() => window.__audit.interactiveCount());
          const count = Math.min(n, MAX_CLICKS);
          for (const i of new Set(Array.from({ length: count }, (_, k) => Math.floor((k * n) / count)))) {
            const label = await p.evaluate((x) => window.__audit.label(x), i);
            const handle = (await p.evaluateHandle((x) => window.__audit.interactive(x), i)).asElement() as ElementHandle<Element> | null;
            if (label === null || !handle) continue;
            const errors: string[] = [];
            const onError = (e: unknown) => errors.push((e as Error).message);
            p.on("pageerror", onError);
            // A trusted click, so actions that require a user gesture run as they would for a person.
            await handle.click().catch(() => handle.evaluate((el) => (el as HTMLElement).click()));
            await p.evaluate(() => window.__audit.settle());
            p.off("pageerror", onError);
            if (errors.length) findings.push({ kind: "render", message: `threw after clicking "${label}": ${errors[0]}`, where });
            findings.push(...(await inspect(p, DESKTOP, `${where}, after clicking "${label}"`, true)));
          }
        }
        return findings;
      }

      const pages: Page[] = [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const run = Promise.all(
          fixtures.map(async (fixture, i) => {
            const p = await openPage(b, script, html, input.code);
            pages.push(p);
            return auditFixture(p, fixture, i === 0);
          }),
        );
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new VerifierUnavailable("verification timed out")), TIMEOUT_MS);
        });
        return report((await Promise.race([run, timeout])).flat(), design);
      } catch (e) {
        if (e instanceof VerifierUnavailable) throw e;
        return [(e as Error).message];
      } finally {
        clearTimeout(timer);
        await Promise.all(pages.map((p) => p.browserContext().close().catch(() => {})));
        release();
      }
    },
  };
}
