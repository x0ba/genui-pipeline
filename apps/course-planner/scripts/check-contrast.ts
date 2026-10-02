// Runs verification (render matrix, legibility audit, click-through) against
// every component, builtin and generated, and the heat() ramp fixture. Exits 1
// on any finding.
//   bun run contrast [componentId ...]
import { choice, defineComponent, serializeComponent, supports, type ComponentDef } from "@malleable/core";
import { chromePath } from "@malleable/verify";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP } from "../server/design";
import { malleable, verifier } from "../server/malleable";

const { config } = malleable;
const kit = config.kit!;

const ramp = serializeComponent({
  ...defineComponent({
    id: "heat-ramp",
    title: "Heat ramp fixture",
    description: "Every heat() step with a label on it",
    audiences: ["student", "advisor"],
    props: { label: choice({ short: "step number", long: "step name" }, { default: "short" }) },
  }),
  source: "generated",
});

async function audit(def: ComponentDef, source: string, opts: { repair?: boolean } = {}) {
  const compiled = await verifier.compile(source, { imports: kit.imports });
  if ("errors" in compiled) return compiled.errors;
  return verifier.verify(
    {
      def,
      code: compiled.code,
      fixtures: config.fixtures!.list.filter((f) => supports(def, f.audience)),
      fixtureProvider: config.fixtures!.provider,
      kit,
      design: config.design!,
    },
    opts,
  );
}

const only = new Set(process.argv.slice(2));
const all: [ComponentDef, string][] = [[ramp, readFileSync(join(APP, "scripts/fixtures/heat-ramp.tsx"), "utf8")]];
for (const d of config.library) all.push([serializeComponent(d), (await config.sources!(d.id))!]);
for (const d of await config.storage.components()) all.push([d, (await config.storage.componentSource(d.id)) ?? ""]);
const targets = all.filter(([d]) => only.size === 0 || only.has(d.id));

console.log(`Chrome: ${chromePath() ?? "not found"}`);
let failed = 0;
for (const [def, source] of targets) {
  const started = Date.now();
  const errors = await audit(def, source);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${def.source.padEnd(9)} ${def.id} (${secs}s)`);
  for (const e of errors) console.log(`       ${e}`);
}
console.log(failed ? `\n${failed} of ${targets.length} components have problems.` : `\nAll ${targets.length} components pass.`);

// Self-test: the audit must reject every illegible fixture, and the runtime
// guard must repair every colour problem among them.
const CASES: Record<string, { expect: string; repairable: boolean }> = {
  translucent: { expect: "below WCAG AA contrast", repairable: true },
  "ignored-fill": { expect: "stylesheet overrides", repairable: true },
  "surface-ink": { expect: "below WCAG AA contrast", repairable: true },
  "wrong-pair": { expect: "below WCAG AA contrast", repairable: true },
  "dark-only": { expect: "dark theme", repairable: true },
  "after-click": { expect: "after clicking", repairable: true },
  overlap: { expect: "over other text", repairable: false },
  tiny: { expect: "too small", repairable: false },
};
let broken = 0;
if (only.size === 0) {
  console.log("\nSelf-test against deliberately illegible fixtures:");
  const source = readFileSync(join(APP, "scripts/fixtures/illegible.tsx"), "utf8");
  for (const [name, { expect, repairable }] of Object.entries(CASES)) {
    const def: ComponentDef = {
      ...ramp,
      id: `illegible-${name}`,
      audiences: ["student"],
      props: { case: { kind: "choice", label: "Case", options: { [name]: name }, default: name } },
    };
    const caught = (await audit(def, source)).join("\n");
    const ok = caught.includes(expect);
    const repaired = repairable ? (await audit(def, source, { repair: true })).join("\n") : "";
    const fixed = !repairable || repaired === "";
    if (!ok || !fixed) broken++;
    console.log(`${ok ? "caught " : "MISSED "} ${fixed ? (repairable ? "repaired" : "        ") : "NOT REPAIRED"} ${name}`);
    if (!ok) console.log(`       expected a finding mentioning "${expect}", got:\n${caught || "       (nothing)"}`);
    if (!fixed) console.log(repaired.replace(/^/gm, "       "));
  }
  console.log(broken ? `\n${broken} self-test case(s) failed.` : "\nThe audit caught every fixture and the guard repaired every colour case.");
}
await verifier.close();
process.exit(failed || broken ? 1 : 0);
