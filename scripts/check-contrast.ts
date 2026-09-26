// Runs the legibility half of checkComponent against every installed component
// (builtin and generated) and the heat() ramp fixture. Exits 1 on any finding.
//   bun run contrast [componentId ...]
import { join } from "node:path";
import { auditLegibility, chromePath } from "../server/claude/contrast";
import { COMPONENT_DIR, getLibrary, ROOT } from "../server/store";
import { PERSONAS } from "../shared/personas";
import type { ComponentDef } from "../shared/spec";

const ramp: ComponentDef = {
  id: "heat-ramp",
  title: "Heat ramp fixture",
  description: "Every heat() step with a label on it",
  atlas: "heatmap",
  source: "generated",
  roles: ["student", "advisor"],
  props: { label: { label: "Label", options: { short: "step number", long: "step name" }, default: "short" } },
};

const only = new Set(process.argv.slice(2));
const sourceOf = (d: ComponentDef) => (d.source === "builtin" ? join(ROOT, "web/src/components", `${d.id}.tsx`) : join(COMPONENT_DIR, `${d.id}.tsx`));
const all: [ComponentDef, string][] = [[ramp, join(ROOT, "scripts/fixtures/heat-ramp.tsx")]];
for (const d of Object.values(getLibrary())) all.push([d, sourceOf(d)]);
const targets = all.filter(([d]) => only.size === 0 || only.has(d.id));

console.log(`Chrome: ${chromePath() ?? "not found"}`);
let failed = 0;
for (const [def, path] of targets) {
  const author = PERSONAS.find((p) => def.roles.includes(p.subject.kind))!.subject;
  const started = Date.now();
  const errors = await auditLegibility(path, def, author);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${def.source.padEnd(9)} ${def.id} (${secs}s)`);
  for (const e of errors) console.log(`       ${e}`);
}
console.log(failed ? `\n${failed} of ${targets.length} components have illegible text.` : `\nAll ${targets.length} components are legible.`);

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
  const author = PERSONAS[0].subject;
  for (const [name, { expect, repairable }] of Object.entries(CASES)) {
    const def: ComponentDef = {
      ...ramp,
      id: `illegible-${name}`,
      roles: [author.kind],
      props: { case: { label: "Case", options: { [name]: name }, default: name } },
    };
    const path = join(ROOT, "scripts/fixtures/illegible.tsx");
    const caught = (await auditLegibility(path, def, author)).join("\n");
    const ok = caught.includes(expect);
    let repaired = "";
    if (repairable) repaired = (await auditLegibility(path, def, author, { repair: true })).join("\n");
    const fixed = !repairable || repaired === "";
    if (!ok || !fixed) broken++;
    console.log(`${ok ? "caught " : "MISSED "} ${fixed ? (repairable ? "repaired" : "        ") : "NOT REPAIRED"} ${name}`);
    if (!ok) console.log(`       expected a finding mentioning "${expect}", got:\n${caught || "       (nothing)"}`);
    if (!fixed) console.log(repaired.replace(/^/gm, "       "));
  }
  console.log(broken ? `\n${broken} self-test case(s) failed.` : "\nThe audit caught every fixture and the guard repaired every colour case.");
}
process.exit(failed || broken ? 1 : 0);
