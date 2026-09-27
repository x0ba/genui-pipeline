import { z } from "zod";

// A prop is one design-space dimension a component realizes. Its options come from
// the Pattern Atlas variations; their descriptions double as Jev Choice criteria.
export const PropDef = z.object({
  label: z.string().describe("Short name of the dimension, e.g. 'Result representation'"),
  atlas: z.string().optional().describe("Atlas sub-dimension this prop realizes, as '<entry>.<subKey>'"),
  // z.record() output breaks the Agent SDK's tool listing, so maps use catchall objects.
  options: z
    .object({})
    .catchall(z.string())
    .describe("Option value -> literal description of when that option is right. At least two."),
  default: z.string(),
});
export type PropDef = z.infer<typeof PropDef>;

export const ComponentDef = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "kebab-case id"),
  title: z.string(),
  description: z.string().describe("What the component shows and lets the person do"),
  atlas: z.string().describe("Atlas entry id this component instantiates"),
  source: z.enum(["builtin", "generated"]),
  roles: z.array(z.enum(["student", "advisor"])).min(1).describe("Subjects whose data it can show"),
  props: z.object({}).catchall(PropDef),
  origin: z
    .object({ request: z.string(), userId: z.string(), createdAt: z.string(), runId: z.string() })
    .optional(),
});
export type ComponentDef = z.infer<typeof ComponentDef>;

export const Region = z.enum(["top", "main", "aside"]);
export type Region = z.infer<typeof Region>;

export const Slot = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  component: z.string(),
  region: Region,
  props: z.object({}).catchall(z.string()).default({}).describe("Fixed prop values for this user"),
  adaptive: z
    .array(z.string())
    .default([])
    .describe("Prop keys Jev chooses per request; the rest stay fixed"),
});
export type Slot = z.infer<typeof Slot>;

export const Layout = z.enum(["main-aside", "stack", "columns"]);
export type Layout = z.infer<typeof Layout>;

export const LAYOUT_CRITERIA: Record<Layout, string> = {
  "main-aside": "A wide primary column with a narrower supporting column beside it. Suits desktop screens.",
  stack: "One single column, every part stacked vertically. Suits phones and narrow screens.",
  columns: "Two equal columns side by side, for comparing two things at once on a wide screen.",
};

export const View = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string(),
  purpose: z
    .string()
    .describe("Literal description of the requests this view answers. Jev reads it to route requests."),
  layout: Layout,
  roles: z
    .array(z.enum(["student", "advisor"]))
    .optional()
    .describe("Only in the shared default spec: subjects this view is shown to"),
  slots: z.array(Slot).min(1),
});
export type View = z.infer<typeof View>;

export const Subject = z.object({
  kind: z.enum(["student", "advisor"]),
  id: z.string(),
});
export type Subject = z.infer<typeof Subject>;

export const ChangelogEntry = z.object({
  version: z.number(),
  at: z.string(),
  by: z.enum(["default", "claude-personalize", "claude-extend", "system"]),
  summary: z.string(),
  runId: z.string().optional(),
});

export const Spec = z.object({
  id: z.string(),
  version: z.number().int().min(1),
  userId: z.string().nullable(),
  parent: z.string().nullable().describe("'<specId>@<version>' this spec was derived from"),
  profile: z
    .string()
    .max(900)
    .describe("Facts about the user Jev reads as state on every request"),
  home: z.string(),
  views: z.array(View).min(1),
  rationale: z.array(z.string()).default([]),
  changelog: z.array(ChangelogEntry).default([]),
});
export type Spec = z.infer<typeof Spec>;

/** Referential checks zod can't express: views, components and props must line up. */
export function checkSpec(spec: Spec, library: Record<string, ComponentDef>, role: Subject["kind"] | null): string[] {
  const errors: string[] = [];
  const viewIds = new Set<string>();
  for (const view of spec.views) {
    if (viewIds.has(view.id)) errors.push(`duplicate view id '${view.id}'`);
    viewIds.add(view.id);
    const slotIds = new Set<string>();
    for (const slot of view.slots) {
      const where = `view '${view.id}' slot '${slot.id}'`;
      if (slotIds.has(slot.id)) errors.push(`${where}: duplicate slot id`);
      slotIds.add(slot.id);
      const def = library[slot.component];
      if (!def) {
        errors.push(`${where}: unknown component '${slot.component}'`);
        continue;
      }
      for (const r of view.roles ?? (role ? [role] : []))
        if (!def.roles.includes(r)) errors.push(`${where}: component '${def.id}' does not support ${r} data`);
      for (const [key, value] of Object.entries(slot.props)) {
        const prop = def.props[key];
        if (!prop) errors.push(`${where}: '${def.id}' has no prop '${key}'`);
        else if (!(value in prop.options))
          errors.push(`${where}: '${value}' is not an option of ${def.id}.${key} (${Object.keys(prop.options).join(", ")})`);
      }
      for (const key of slot.adaptive) {
        if (!def.props[key]) errors.push(`${where}: adaptive prop '${key}' does not exist on '${def.id}'`);
        if (key in slot.props) errors.push(`${where}: '${key}' is both fixed and adaptive`);
      }
    }
  }
  if (!viewIds.has(spec.home)) errors.push(`home '${spec.home}' is not a view id`);
  return errors;
}

export function viewsFor(spec: Spec, role: Subject["kind"]) {
  return spec.views.filter((v) => !v.roles || v.roles.includes(role));
}

export function checkPropDefs(props: Record<string, PropDef>): string[] {
  return Object.entries(props).flatMap(([key, p]) => [
    ...(Object.keys(p.options).length < 2 ? [`prop '${key}' needs at least two options`] : []),
    ...(p.default in p.options ? [] : [`prop '${key}' default '${p.default}' is not one of its options`]),
  ]);
}

/** Resolve a slot's effective prop values: component default < fixed < chosen. */
export function resolveProps(
  def: ComponentDef,
  slot: Slot,
  chosen: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, prop] of Object.entries(def.props)) out[key] = prop.default;
  Object.assign(out, slot.props);
  for (const [key, value] of Object.entries(chosen)) if (slot.adaptive.includes(key)) out[key] = value;
  return out;
}

/** A prop of the served view whose options all miss what the request asks for. */
export type Unmatched = {
  slotId: string;
  component: string;
  prop: string;
  label: string;
  options: string[];
  probability: number;
};

// What Jev decided for one request, returned to the client and logged to the pipeline.
export type Decision = {
  id: string;
  userId: string;
  specVersion: number;
  request: string;
  view: string;
  viewConfidence: number;
  viewProbabilities: Record<string, number>;
  viewTitles: Record<string, string>;
  layout: Layout;
  props: Record<string, Record<string, string>>; // slotId -> prop -> value
  propConfidence: Record<string, Record<string, number>>;
  gap: { flagged: boolean; probability: number; kind: string; unmatched: Unmatched[] } | null;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  model: string;
  questionCount: number;
};

export type ServeContext = {
  device: "desktop" | "phone";
  phase: "planning" | "registration-open" | "add-drop";
};
