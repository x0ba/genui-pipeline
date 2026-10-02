// Extracts the design-space JSON embedded in "Pattern Atlas.html" into a compact
// data/atlas.json: the vocabulary the spec builder picks patterns and variations from.
const html = await Bun.file(new URL("../Pattern Atlas.html", import.meta.url)).text();
const match = html.match(/<script type="application\/json" id="atlas-json"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error("atlas-json block not found");
const raw = JSON.parse(match[1]);

type RawVar = [string, string, string];
const atlas = {
  about: raw.thesis as string,
  families: raw.families.map((f: any) => ({ id: f.id, name: f.name, def: f.def })),
  archetypes: raw.archetypes.map((a: any) => ({ id: a.id, name: a.name, def: a.def })),
  entries: raw.entries.map((e: any) => ({
    id: e.id,
    name: e.name,
    level: e.level,
    archetype: e.archetype,
    aliases: e.aliases,
    def: e.def,
    components: e.components.map(([name, def]: [string, string]) => ({ name, def })),
    dims: e.dims.map((d: any) => ({
      name: d.name,
      family: d.family,
      q: d.q,
      subs: d.subs.map((s: any) => ({
        key: s.key,
        name: s.name,
        sel: s.sel,
        vars: (s.vars as RawVar[]).map(([name, def, example]) => ({ name, def: def || undefined, example })),
      })),
    })),
    uses: e.relations?.uses ?? [],
    neighbors: e.relations?.neighbors ?? [],
  })),
};

await Bun.write(new URL("../data/atlas.json", import.meta.url), JSON.stringify(atlas));
console.log(`atlas: ${atlas.entries.length} entries`);
