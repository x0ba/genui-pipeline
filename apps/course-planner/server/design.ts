import { defineDesign } from "@malleable/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const APP = join(import.meta.dir, "..");

const heatPairs = [1, 2, 3, 4, 5, 6].map((n) => ({ text: [`--vbg-custom-heat-ink-${n}`], background: [`--vbg-custom-heat-${n}`] }));

export const design = defineDesign({
  stylesheets: ["https://vercel.com/geist/vercel-brand.css", join(APP, "web/src/styles/app.css")],
  themes: { light: { attribute: ["data-theme", "light"] }, dark: { attribute: ["data-theme", "dark"] } },
  textColors: ["--vbg-text-primary", "--vbg-text-secondary"],
  safePairs: [
    { text: ["--vbg-text-primary", "--vbg-text-secondary"], background: ["--vbg-surface-primary", "--vbg-surface-secondary", "--vbg-custom-heat-0"] },
    { text: ["--vbg-text-on-contrast"], background: ["--vbg-surface-contrast"] },
    ...heatPairs,
  ],
  rules: readFileSync(join(APP, "web/src/kit/DESIGN.md"), "utf8"),
  frame: `<div class="vbg-report" data-malleable-root><div class="vbg-custom-app" style="display:block;min-height:0"><main class="vbg-custom-main"><section class="vbg-custom-slot"><div data-malleable-mount></div></section></main></div></div>`,
  contrastAdvice:
    "Text on a filled mark uses heat(t).fill with heat(t).ink, or the contrast surface pair; never a series colour or a translucent fill.",
});
