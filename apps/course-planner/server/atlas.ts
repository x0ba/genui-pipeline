import type { CatalogPlugin } from "@malleable/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { APP } from "./design";

type AtlasVar = { name: string; def?: string; example: string };
type AtlasSub = { key: string; name: string; sel: "one" | "many"; vars: AtlasVar[] };
type AtlasEntry = {
  id: string;
  name: string;
  level: "archetype" | "pattern" | "component";
  archetype: string;
  aliases: string[];
  def: string;
  components: { name: string; def: string }[];
  dims: { name: string; family: string; q: string; subs: AtlasSub[] }[];
  uses: string[];
  neighbors: string[];
};

export const atlas = JSON.parse(readFileSync(join(APP, "data/atlas.json"), "utf8")) as {
  about: string;
  entries: AtlasEntry[];
};
const byId = new Map(atlas.entries.map((e) => [e.id, e]));

export function searchAtlas(query: string, limit = 8) {
  const terms = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const scored = atlas.entries.map((e) => {
    const head = `${e.id} ${e.name} ${e.aliases.join(" ")}`.toLowerCase();
    const body = `${e.def} ${e.dims.map((d) => `${d.name} ${d.subs.map((s) => s.vars.map((v) => v.name).join(" ")).join(" ")}`).join(" ")}`.toLowerCase();
    const score = terms.reduce((n, t) => n + (head.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e }) => ({ id: e.id, name: e.name, level: e.level, def: e.def }));
}

export function getAtlasEntry(id: string) {
  const e = byId.get(id);
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    level: e.level,
    def: e.def,
    parts: e.components,
    dimensions: e.dims.map((d) => ({
      name: d.name,
      family: d.family,
      question: d.q,
      subs: d.subs.map((s) => ({
        key: `${e.id}.${s.key}`,
        name: s.name,
        select: s.sel,
        variations: s.vars.map((v) => (v.def ? `${v.name}: ${v.def}` : `${v.name} (e.g. ${v.example})`)),
      })),
    })),
    uses: e.uses,
    neighbors: e.neighbors,
  };
}

const json = (value: unknown) => JSON.stringify(value, null, 1);

export const atlasCatalog: CatalogPlugin = {
  about:
    "Components instantiate entries of the Pattern Atlas, a catalog of UI design patterns and their design spaces; a prop's catalog key, such as 'chart.markType', names the sub-dimension it realizes.",
  tools: [
    {
      name: "catalog_search",
      description: `Keyword search over the Pattern Atlas, a catalog of ${atlas.entries.length} UI design patterns and their design spaces.`,
      input: { query: z.string() },
      readOnly: true,
      run: async ({ query }) => ({ ok: true, text: json(searchAtlas(String(query))) }),
    },
    {
      name: "catalog_get",
      description: "One Pattern Atlas entry with its dimensions, sub-dimensions (keys like 'chart.markType') and variations.",
      input: { id: z.string() },
      readOnly: true,
      run: async ({ id }) => {
        const entry = getAtlasEntry(String(id));
        return entry ? { ok: true, text: json(entry) } : { ok: false, text: `no atlas entry '${id}'; use catalog_search` };
      },
    },
  ],
};
