// Imports the pre-library runtime (data/runtime: library.json, components/*.tsx,
// specs/<user>.json) into the library's storage. Specs move from top-level views
// with `region` and `roles` to regions.dashboard with `area` and `audiences`;
// components move from `{ props }` to spread props and are compiled to artifacts.
// Legacy components were shared with everyone, so they are imported as shared.
//
//   bun run scripts/import-legacy.ts [from=data/runtime] [into=data/store]
import { checkComponentDef, Spec, type ComponentDef, type PropDefinition } from "@malleable/core";
import { fsStorage } from "@malleable/server";
import { compile, staticCheck } from "@malleable/verify";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP } from "../server/design";

const from = resolve(process.argv[2] ?? join(APP, "data/runtime"));
const into = resolve(process.argv[3] ?? join(APP, "data/store"));
const storage = fsStorage(into);
const IMPORTS = ["react", "motion/react", "@kit"];

type LegacyProp = { label: string; atlas?: string; options: Record<string, string>; default: string };
type LegacyDef = Omit<ComponentDef, "props" | "audiences" | "catalog" | "version"> & {
  atlas?: string;
  roles?: string[];
  props: Record<string, LegacyProp>;
};
type LegacySlot = { id: string; component: string; region: string; props: Record<string, string>; adaptive: string[] };
type LegacyView = { id: string; title: string; purpose: string; layout: string; roles?: string[]; slots: LegacySlot[] };
type LegacySpec = Omit<Spec, "regions"> & { home: string; views: LegacyView[] };

const BY: Record<string, Spec["changelog"][number]["by"]> = { "claude-personalize": "personalize", "claude-extend": "extend" };

function convertDef(d: LegacyDef): ComponentDef {
  return {
    id: d.id,
    version: 1,
    title: d.title,
    description: d.description,
    ...(d.roles ? { audiences: d.roles } : {}),
    ...(d.atlas ? { catalog: d.atlas } : {}),
    source: "generated",
    scope: "shared",
    props: Object.fromEntries(
      Object.entries(d.props).map(([key, p]): [string, PropDefinition] => [
        key,
        { kind: "choice", label: p.label, options: p.options, default: p.default, ...(p.atlas ? { catalog: p.atlas } : {}) },
      ]),
    ),
    ...(d.origin ? { origin: d.origin } : {}),
  };
}

/** `({ props }: { props: Record<string, string> })` becomes `(props: Record<string, string>)`, so `props.x` reads stay valid. */
function convertSource(source: string) {
  const out = source
    .replace(/type Props = \{ props: Record<string, string> \};/, "type Props = Record<string, string>;")
    .replace(/(export default function \w+)\(\{ props \}: Props\)/, "$1(props: Props)");
  return out === source ? null : out;
}

function convertSpec(s: LegacySpec): Spec {
  const { home, views, ...rest } = s;
  return Spec.parse({
    ...rest,
    regions: {
      dashboard: {
        home,
        views: views.map(({ roles, slots, ...v }) => ({
          ...v,
          ...(roles ? { audiences: roles } : {}),
          slots: slots.map(({ region, ...slot }) => ({ ...slot, area: region })),
        })),
      },
    },
    changelog: s.changelog.map((c) => ({ ...c, by: BY[c.by] ?? c.by })),
  });
}

const problems: string[] = [];
const libraryPath = join(from, "library.json");
const defs = existsSync(libraryPath) ? (JSON.parse(readFileSync(libraryPath, "utf8")) as LegacyDef[]) : [];
for (const legacy of defs) {
  const def = convertDef(legacy);
  const path = join(from, "components", `${def.id}.tsx`);
  if (!existsSync(path)) {
    problems.push(`${def.id}: no source at ${path}`);
    continue;
  }
  const source = convertSource(readFileSync(path, "utf8"));
  if (!source) {
    problems.push(`${def.id}: the default export does not have the legacy ({ props }: Props) signature`);
    continue;
  }
  const errors = [...checkComponentDef(def), ...staticCheck(source, { imports: IMPORTS })];
  const compiled = errors.length ? null : await compile(source, { imports: IMPORTS });
  if (compiled && "errors" in compiled) errors.push(...compiled.errors);
  if (errors.length || !compiled || "errors" in compiled) {
    problems.push(`${def.id}:\n  - ${errors.join("\n  - ")}`);
    continue;
  }
  await storage.saveArtifact(compiled.hash, compiled.code);
  await storage.saveComponent({ ...def, artifact: { hash: compiled.hash } }, source);
  console.log(`component ${def.id} -> ${compiled.hash.slice(0, 12)}`);
}

const specsDir = join(from, "specs");
for (const file of existsSync(specsDir) ? readdirSync(specsDir).filter((f) => f.endsWith(".json")) : []) {
  const userId = file.replace(/\.json$/, "");
  const raw = JSON.parse(readFileSync(join(specsDir, file), "utf8")) as { versions?: LegacySpec[] } | LegacySpec;
  const versions = "versions" in raw && raw.versions ? raw.versions : [raw as LegacySpec];
  await storage.deleteSpecs(userId);
  try {
    for (const v of versions) await storage.saveSpec(userId, convertSpec(v));
    console.log(`spec ${userId}: ${versions.length} versions`);
  } catch (e) {
    problems.push(`spec ${userId}: ${(e as Error).message}`);
  }
}

console.log(`imported into ${into}`);
if (problems.length) {
  console.error(`\n${problems.length} not imported:\n${problems.join("\n")}`);
  process.exit(1);
}
