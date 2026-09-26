import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILTIN_COMPONENTS } from "../shared/library";
import { ComponentDef, Spec } from "../shared/spec";

export const ROOT = resolve(import.meta.dir, "..");
export const RUNTIME = join(ROOT, "data/runtime");
export const SPEC_DIR = join(RUNTIME, "specs");
export const COMPONENT_DIR = join(RUNTIME, "components");
export const STAGING_DIR = join(RUNTIME, "staging");
const LIBRARY_FILE = join(RUNTIME, "library.json");

for (const dir of [SPEC_DIR, COMPONENT_DIR, STAGING_DIR]) mkdirSync(dir, { recursive: true });

export const DEFAULT_SPEC: Spec = Spec.parse(JSON.parse(readFileSync(join(ROOT, "data/specs/default.json"), "utf8")));

// ---------------------------------------------------------------- component library
function readGenerated(): ComponentDef[] {
  if (!existsSync(LIBRARY_FILE)) return [];
  const defs = ComponentDef.array().parse(JSON.parse(readFileSync(LIBRARY_FILE, "utf8")));
  // A library entry without code on disk is unusable; drop it rather than render a hole.
  return defs.filter((d) => existsSync(join(COMPONENT_DIR, `${d.id}.tsx`)));
}

export function getLibrary(): Record<string, ComponentDef> {
  return Object.fromEntries([...BUILTIN_COMPONENTS, ...readGenerated()].map((c) => [c.id, c]));
}

export function addGenerated(def: ComponentDef) {
  const defs = readGenerated().filter((d) => d.id !== def.id);
  defs.push(def);
  writeFileSync(LIBRARY_FILE, JSON.stringify(defs, null, 2));
}

// ---------------------------------------------------------------- specs
type SpecFile = { versions: Spec[] };
const specPath = (userId: string) => join(SPEC_DIR, `${userId}.json`);

export function getSpecHistory(userId: string): Spec[] {
  const path = specPath(userId);
  if (!existsSync(path)) return [];
  return (JSON.parse(readFileSync(path, "utf8")) as SpecFile).versions.map((v) => Spec.parse(v));
}

/** The user's own spec if one exists, otherwise the shared default. */
export function getSpec(userId: string): Spec {
  const history = getSpecHistory(userId);
  return history.at(-1) ?? DEFAULT_SPEC;
}

export function saveSpec(userId: string, spec: Spec) {
  const versions = getSpecHistory(userId);
  versions.push(spec);
  writeFileSync(specPath(userId), JSON.stringify({ versions } satisfies SpecFile, null, 2));
}

export function resetUser(userId: string) {
  rmSync(specPath(userId), { force: true });
}

export function resetAll() {
  for (const f of readdirSync(SPEC_DIR)) rmSync(join(SPEC_DIR, f), { force: true });
  for (const f of readdirSync(COMPONENT_DIR)) rmSync(join(COMPONENT_DIR, f), { force: true });
  for (const f of readdirSync(STAGING_DIR)) rmSync(join(STAGING_DIR, f), { force: true });
  rmSync(LIBRARY_FILE, { force: true });
}
