import { Spec, type ComponentDef, type Decision } from "@malleable/core";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Where specs, component definitions and compiled components live. Adapters
// for databases or object stores implement the same interface.

export type StoredComponent = { def: ComponentDef; source: string };

export interface Storage {
  /** Every saved version of a person's spec, oldest first. */
  specHistory(userId: string): Promise<Spec[]>;
  saveSpec(userId: string, spec: Spec): Promise<void>;
  deleteSpecs(userId: string): Promise<void>;
  /** Every generated component definition, private and shared. */
  components(): Promise<ComponentDef[]>;
  componentSource(id: string): Promise<string | null>;
  saveComponent(def: ComponentDef, source: string): Promise<void>;
  /** Compiled modules, stored under their content hash. */
  artifact(hash: string): Promise<string | null>;
  saveArtifact(hash: string, code: string): Promise<void>;
  /** Decisions are kept so `/extend` can look one up instead of trusting the client's description of a gap. */
  decision(id: string): Promise<Decision | null>;
  saveDecision(decision: Decision): Promise<void>;
}

const MAX_DECISIONS = 2000;

/** Decisions are short-lived: kept in memory, newest last. */
function decisionCache() {
  const map = new Map<string, Decision>();
  return {
    get: async (id: string) => map.get(id) ?? null,
    async save(d: Decision) {
      map.set(d.id, d);
      if (map.size > MAX_DECISIONS) map.delete(map.keys().next().value!);
    },
  };
}

const safe = (name: string) => encodeURIComponent(name).replace(/\./g, "%2E");
const HASH = /^[0-9a-f]{8,64}$/;

/** Writes through a temporary file, so a crash never leaves half a JSON file. */
function writeAtomic(path: string, text: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * Filesystem storage:
 *   specs/<userId>.json                  every version of one person's spec
 *   components/<id>/definition.json      a generated component's definition
 *   components/<id>/source.tsx           its source
 *   artifacts/<hash>.js                  compiled modules
 */
export function fsStorage(dir: string): Storage {
  const specs = join(dir, "specs");
  const components = join(dir, "components");
  const artifacts = join(dir, "artifacts");
  for (const d of [specs, components, artifacts]) mkdirSync(d, { recursive: true });
  const specPath = (userId: string) => join(specs, `${safe(userId)}.json`);
  const decisions = decisionCache();

  return {
    async specHistory(userId) {
      const path = specPath(userId);
      if (!existsSync(path)) return [];
      return (JSON.parse(readFileSync(path, "utf8")) as { versions: unknown[] }).versions.map((v) => Spec.parse(v));
    },
    async saveSpec(userId, spec) {
      const versions = await this.specHistory(userId);
      versions.push(spec);
      writeAtomic(specPath(userId), JSON.stringify({ versions }, null, 2));
    },
    async deleteSpecs(userId) {
      rmSync(specPath(userId), { force: true });
    },
    async components() {
      const out: ComponentDef[] = [];
      for (const id of readdirSync(components)) {
        const path = join(components, id, "definition.json");
        if (existsSync(path)) out.push(JSON.parse(readFileSync(path, "utf8")) as ComponentDef);
      }
      return out;
    },
    async componentSource(id) {
      const path = join(components, safe(id), "source.tsx");
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    },
    async saveComponent(def, source) {
      const d = join(components, safe(def.id));
      mkdirSync(d, { recursive: true });
      writeAtomic(join(d, "source.tsx"), source);
      writeAtomic(join(d, "definition.json"), JSON.stringify(def, null, 2));
    },
    async artifact(hash) {
      if (!HASH.test(hash)) return null;
      const path = join(artifacts, `${hash}.js`);
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    },
    async saveArtifact(hash, code) {
      if (!HASH.test(hash)) throw new Error(`invalid artifact hash '${hash}'`);
      writeAtomic(join(artifacts, `${hash}.js`), code);
    },
    decision: decisions.get,
    saveDecision: decisions.save,
  };
}

/** In-memory storage, for tests and throwaway servers. */
export function memoryStorage(): Storage {
  const specs = new Map<string, Spec[]>();
  const comps = new Map<string, StoredComponent>();
  const arts = new Map<string, string>();
  const decisions = decisionCache();
  return {
    specHistory: async (userId) => [...(specs.get(userId) ?? [])],
    saveSpec: async (userId, spec) => void specs.set(userId, [...(specs.get(userId) ?? []), spec]),
    deleteSpecs: async (userId) => void specs.delete(userId),
    components: async () => [...comps.values()].map((c) => c.def),
    componentSource: async (id) => comps.get(id)?.source ?? null,
    saveComponent: async (def, source) => void comps.set(def.id, { def, source }),
    artifact: async (hash) => arts.get(hash) ?? null,
    saveArtifact: async (hash, code) => void arts.set(hash, code),
    decision: decisions.get,
    saveDecision: decisions.save,
  };
}
