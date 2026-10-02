import type { ComponentDef, ComponentDefinition } from "./component";
import { optionsOf } from "./resolve";
import { checkSlot, type CheckContext, type RegionSpec, type Slot, type Spec } from "./spec";

// When developers change a builtin, they declare how saved specs follow it.
// Migrations are idempotent: an entry applies only while the old name is no
// longer valid, so specs need not record which version they were written against.

function parsePath(path: string): { prop: string; option?: string } | null {
  const [head, prop, option, ...rest] = path.split(".");
  if (head !== "props" || !prop || rest.length) return null;
  return { prop, option };
}

/** Apply a component's migrations to one slot. */
export function migrateSlot(slot: Slot, def: ComponentDef): { slot: Slot; notes: string[] } {
  const migrations = (def as ComponentDefinition).migrations;
  if (!migrations) return { slot, notes: [] };
  const next: Slot = { ...slot, props: { ...slot.props }, adaptive: [...slot.adaptive], ...(slot.options ? { options: { ...slot.options } } : {}) };
  const notes: string[] = [];
  const validOption = (prop: string, option: string) => option in optionsOf(def, next, prop);
  const renameProp = (from: string, to: string | null) => {
    if (from in def.props) return;
    const used = from in next.props || next.adaptive.includes(from) || Boolean(next.options?.[from]);
    if (!used) return;
    if (to === null) {
      delete next.props[from];
      next.adaptive = next.adaptive.filter((k) => k !== from);
      if (next.options) delete next.options[from];
      notes.push(`slot '${slot.id}': removed prop '${from}' of '${def.id}'`);
      return;
    }
    if (from in next.props) {
      next.props[to] = next.props[from]!;
      delete next.props[from];
    }
    next.adaptive = next.adaptive.map((k) => (k === from ? to : k));
    if (next.options?.[from]) {
      next.options[to] = next.options[from]!;
      delete next.options[from];
    }
    notes.push(`slot '${slot.id}': renamed prop '${def.id}.${from}' to '${to}'`);
  };
  const replaceOption = (prop: string, from: string, to: string | null) => {
    if (next.props[prop] !== from || validOption(prop, from)) return;
    if (to === null) delete next.props[prop];
    else next.props[prop] = to;
    notes.push(`slot '${slot.id}': ${def.id}.${prop} '${from}' became ${to === null ? "the default" : `'${to}'`}`);
  };

  for (const version of Object.keys(migrations).map(Number).sort((a, b) => a - b)) {
    const m = migrations[version]!;
    for (const [path, to] of Object.entries(m.renamed ?? {})) {
      const p = parsePath(path);
      if (!p) continue;
      if (p.option) replaceOption(p.prop, p.option, to);
      else renameProp(p.prop, to);
    }
    for (const [path, to] of Object.entries(m.removed ?? {})) {
      const p = parsePath(path);
      if (!p) continue;
      if (p.option) replaceOption(p.prop, p.option, to);
      else renameProp(p.prop, null);
    }
  }
  return { slot: next, notes };
}

export type NormalizeContext = CheckContext & { defaults: Record<string, RegionSpec> };

/**
 * Bring a saved spec in line with the app as it is now: apply migrations, then
 * check every slot. A slot that still fails is dropped, a view left empty is
 * dropped, and a region with no valid view falls back to the default. Returns
 * the notes describing each change; the caller records them in the changelog.
 */
export function normalizeSpec(spec: Spec, ctx: NormalizeContext): { spec: Spec; notes: string[] } {
  const notes: string[] = [];
  const regions: Spec["regions"] = {};
  for (const [name, regionSpec] of Object.entries(spec.regions)) {
    const region = ctx.regions[name];
    if (!region) {
      notes.push(`region '${name}' no longer exists`);
      continue;
    }
    const views: RegionSpec["views"] = [];
    for (const view of regionSpec.views) {
      if (views.some((v) => v.id === view.id)) {
        notes.push(`dropped duplicate view '${view.id}'`);
        continue;
      }
      const slots: Slot[] = [];
      for (const original of view.slots) {
        const def = ctx.library[original.component];
        const { slot, notes: migrated } = def ? migrateSlot(original, def) : { slot: original, notes: [] };
        notes.push(...migrated.map((n) => `view '${view.id}' ${n}`));
        const errors = slots.some((s) => s.id === slot.id) ? ["duplicate slot id"] : checkSlot(slot, view, region, ctx);
        if (errors.length) notes.push(`dropped slot '${slot.id}' from view '${view.id}': ${errors.join("; ")}`);
        else slots.push(slot);
      }
      if (!slots.length) {
        notes.push(`dropped view '${view.id}': no slot is valid`);
        continue;
      }
      const layout = region.layouts.some((l) => l.id === view.layout) ? view.layout : region.layouts[0]!.id;
      if (layout !== view.layout) notes.push(`view '${view.id}': layout '${view.layout}' became '${layout}'`);
      views.push({ ...view, layout, slots });
    }
    if (!views.length) {
      notes.push(`region '${name}' fell back to the default: no view is valid`);
      continue;
    }
    const home = views.some((v) => v.id === regionSpec.home) ? regionSpec.home : views[0]!.id;
    if (home !== regionSpec.home) notes.push(`region '${name}': home '${regionSpec.home}' became '${home}'`);
    regions[name] = { home, views };
  }
  return { spec: notes.length ? { ...spec, regions } : spec, notes };
}
