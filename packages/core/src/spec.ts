import { z } from "zod";
import { checkParamValue, ID, supports, type ComponentDef, type ParamProp } from "./component";

// One person's interface: for each region, a list of views, each a layout of
// slots, each slot a component with prop values. Everyone starts on the default.
// z.record() output breaks some agent frameworks' tool listings, so maps are catchall objects.

const Id = z.string().regex(ID, "kebab-case id");

export const SlotOption = z.object({ value: z.unknown(), when: z.string().min(1) });

export const Slot = z.object({
  id: Id,
  component: z.string(),
  area: z.string().describe("One of the region's areas"),
  props: z.object({}).catchall(z.string()).default({}).describe("Fixed prop values for this person"),
  adaptive: z.array(z.string()).default([]).describe("Prop keys the decider chooses per request; the rest stay fixed"),
  options: z
    .object({})
    .catchall(z.object({}).catchall(SlotOption))
    .optional()
    .describe("Extra options for this slot's `param` props: prop -> option key -> { value, when }"),
});
export type Slot = z.infer<typeof Slot>;

export const View = z.object({
  id: Id,
  title: z.string(),
  purpose: z.string().describe("Literal description of the requests this view answers. The decider reads it to route requests."),
  layout: z.string(),
  audiences: z.array(z.string()).optional().describe("Only in the shared default spec: audiences this view is shown to"),
  slots: z.array(Slot).min(1),
});
export type View = z.infer<typeof View>;

export const RegionSpec = z.object({ home: z.string(), views: z.array(View).min(1) });
export type RegionSpec = z.infer<typeof RegionSpec>;

export const ChangelogEntry = z.object({
  version: z.number(),
  at: z.string(),
  by: z.enum(["default", "personalize", "extend", "system"]),
  summary: z.string(),
  runId: z.string().optional(),
});
export type ChangelogEntry = z.infer<typeof ChangelogEntry>;

export const Spec = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  userId: z.string().nullable(),
  parent: z.string().nullable().describe("'<specId>@<version>' this spec was derived from"),
  profile: z.string().max(900).describe("Facts about the person the decider reads as state on every request"),
  regions: z.object({}).catchall(RegionSpec),
  rationale: z.array(z.string()).default([]),
  changelog: z.array(ChangelogEntry).default([]),
});
export type Spec = z.infer<typeof Spec>;

// ---------------------------------------------------------------- layouts and regions

/** A layout the decider can pick for a view. Areas marked `span` take the full width; the rest fill the columns in order. */
export type LayoutDefinition = {
  id: string;
  description: string;
  /** CSS grid-template-columns. */
  columns: string;
  /** Optional CSS grid-template-areas, naming the region's areas. */
  template?: string;
};

export const defineLayout = (layout: LayoutDefinition) => layout;

export const mainAside = defineLayout({
  id: "main-aside",
  description: "A wide primary column with a narrower supporting column beside it. Suits desktop screens.",
  columns: "minmax(0, 2fr) minmax(0, 1fr)",
});
export const stack = defineLayout({
  id: "stack",
  description: "One single column, every part stacked vertically. Suits phones and narrow screens.",
  columns: "minmax(0, 1fr)",
});
export const columns = defineLayout({
  id: "columns",
  description: "Two equal columns side by side, for comparing two things at once on a wide screen.",
  columns: "minmax(0, 1fr) minmax(0, 1fr)",
});
export const BUILTIN_LAYOUTS = [mainAside, stack, columns];

export type AreaConfig = { name: string; description?: string; span?: boolean };

/** How a region is declared on the server. */
export type RegionConfig = {
  areas: (string | AreaConfig)[];
  /** The area that holds the main content. Defaults to `main`, or the first area that does not span. */
  primary?: string;
  layouts?: LayoutDefinition[];
  default: RegionSpec;
  /** What this part of the page is for, for the builder. */
  description?: string;
};

/** A region as the client and the prompts see it. */
export type RegionInfo = {
  name: string;
  description?: string;
  areas: Required<AreaConfig>[];
  primary: string;
  layouts: LayoutDefinition[];
};

const AREA_DEFAULTS: Record<string, Omit<Required<AreaConfig>, "name">> = {
  top: { description: "spans the full width above the rest (key numbers, notices)", span: true },
  main: { description: "is the primary column", span: false },
  aside: { description: "is the secondary column", span: false },
};

export function regionInfo(name: string, config: RegionConfig): RegionInfo {
  const areas = config.areas.map((a) => {
    const area = typeof a === "string" ? { name: a } : a;
    const known = AREA_DEFAULTS[area.name];
    return { name: area.name, description: area.description ?? known?.description ?? "", span: area.span ?? known?.span ?? false };
  });
  const primary = config.primary ?? (areas.some((a) => a.name === "main") ? "main" : (areas.find((a) => !a.span) ?? areas[0])!.name);
  return { name, ...(config.description ? { description: config.description } : {}), areas, primary, layouts: config.layouts ?? BUILTIN_LAYOUTS };
}

// ---------------------------------------------------------------- checks

export type CheckContext = {
  library: Record<string, ComponentDef>;
  regions: Record<string, RegionInfo>;
  /** The person's audience, for personal specs. Views in the default spec carry their own. */
  audience: string | null;
};

/** Problems with one slot, or an empty list. */
export function checkSlot(slot: Slot, view: View, region: RegionInfo, ctx: CheckContext): string[] {
  const errors: string[] = [];
  if (!region.areas.some((a) => a.name === slot.area))
    errors.push(`area '${slot.area}' is not one of ${region.areas.map((a) => a.name).join(", ")}`);
  const def = ctx.library[slot.component];
  if (!def) return [...errors, `unknown component '${slot.component}'`];
  for (const a of view.audiences ?? (ctx.audience ? [ctx.audience] : []))
    if (!supports(def, a)) errors.push(`component '${def.id}' does not support ${a} data`);
  const extra = slot.options ?? {};
  for (const [key, options] of Object.entries(extra)) {
    const prop = def.props[key];
    if (!prop) errors.push(`options for '${key}', which '${def.id}' does not have`);
    else if (prop.kind !== "param") errors.push(`options for '${def.id}.${key}', which is a choice prop; only param props take extra options`);
    else
      for (const [k, o] of Object.entries(options)) {
        if (!ID.test(k)) errors.push(`option key '${key}.${k}' must be kebab-case`);
        if (k in prop.options) errors.push(`option '${key}.${k}' is already an option of '${def.id}'`);
        for (const issue of checkParamValue(prop as ParamProp, o.value)) errors.push(`option '${key}.${k}' value does not parse: ${issue}`);
      }
  }
  for (const [key, value] of Object.entries(slot.props)) {
    const prop = def.props[key];
    if (!prop) errors.push(`'${def.id}' has no prop '${key}'`);
    else if (!(value in prop.options) && !(value in (extra[key] ?? {})))
      errors.push(`'${value}' is not an option of ${def.id}.${key} (${[...Object.keys(prop.options), ...Object.keys(extra[key] ?? {})].join(", ")})`);
  }
  for (const key of slot.adaptive) {
    if (!def.props[key]) errors.push(`adaptive prop '${key}' does not exist on '${def.id}'`);
    if (key in slot.props) errors.push(`'${key}' is both fixed and adaptive`);
  }
  return errors;
}

/** Referential checks zod cannot express: regions, views, components and props must line up. */
export function checkRegion(name: string, regionSpec: RegionSpec, ctx: CheckContext): string[] {
  const region = ctx.regions[name];
  if (!region) return [`region '${name}' is not declared by the app (${Object.keys(ctx.regions).join(", ")})`];
  const errors: string[] = [];
  const viewIds = new Set<string>();
  for (const view of regionSpec.views) {
    if (viewIds.has(view.id)) errors.push(`duplicate view id '${view.id}'`);
    viewIds.add(view.id);
    if (!region.layouts.some((l) => l.id === view.layout))
      errors.push(`view '${view.id}': layout '${view.layout}' is not one of ${region.layouts.map((l) => l.id).join(", ")}`);
    const slotIds = new Set<string>();
    for (const slot of view.slots) {
      const where = `view '${view.id}' slot '${slot.id}'`;
      if (slotIds.has(slot.id)) errors.push(`${where}: duplicate slot id`);
      slotIds.add(slot.id);
      for (const e of checkSlot(slot, view, region, ctx)) errors.push(`${where}: ${e}`);
    }
  }
  if (!viewIds.has(regionSpec.home)) errors.push(`home '${regionSpec.home}' is not a view id`);
  return errors;
}

export function checkSpec(spec: Spec, ctx: CheckContext): string[] {
  const names = Object.keys(spec.regions);
  return names.flatMap((name) => checkRegion(name, spec.regions[name]!, ctx).map((e) => (names.length > 1 ? `region '${name}': ${e}` : e)));
}

export function viewsFor(regionSpec: RegionSpec, audience: string | null | undefined) {
  return regionSpec.views.filter((v) => !v.audiences || !audience || v.audiences.includes(audience));
}

/** Copy a region's views for a personal spec: audiences only belong in the shared default. */
export const personalViews = (views: View[]): View[] => views.map(({ audiences: _a, ...v }) => v);
