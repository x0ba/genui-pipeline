import {
  checkComponentDef,
  checkParamValue,
  describeSafePairs,
  ID,
  optionsOf,
  personalViews,
  serializeComponent,
  supports,
  View,
  VerifierUnavailable,
  type ComponentDef,
  type Fixture,
  type JsonSchema,
  type ParamProp,
  type PropDefinition,
  type RegionInfo,
  type RegionSpec,
  type Slot,
  type Spec,
  type Tool,
  type ToolResult,
  type Unmatched,
} from "@malleable/core";
import { z } from "zod";
import type { MalleableConfig, UserDescription } from "./config";

// The builder's prompts and tools. Every tool validates before it saves, so
// whatever agent framework runs them, nothing the model writes reaches a person
// without passing the same checks.

/** What the tools need from the server. */
export type BuilderContext = {
  config: MalleableConfig;
  regions: Record<string, RegionInfo>;
  builtins: Record<string, ComponentDef>;
  libraryFor(userId: string): Promise<Record<string, ComponentDef>>;
  specOf(userId: string, audience: string | null): Promise<Spec>;
  regionSpecOf(spec: Spec, region: string, audience: string | null): RegionSpec;
  /** Checks a new version of the person's spec and saves it. Returns errors, or the saved spec. */
  commitSpec(input: {
    userId: string;
    audience: string | null;
    base: Spec;
    region: string;
    regionSpec: RegionSpec;
    profile?: string;
    rationale?: string[];
    by: "personalize" | "extend";
    summary: string;
    runId: string;
  }): Promise<{ errors: string[] } | { spec: Spec }>;
  installComponent(def: ComponentDef, source: string, code: string, runId: string): Promise<void>;
};

export type RunInput = { userId: string; user: UserDescription; region: string; runId: string };

const ok = (value: unknown): ToolResult => ({ ok: true, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) });
const fail = (text: string): ToolResult => ({ ok: false, text });
const zodErrors = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("\n");
const audienceOf = (user: UserDescription) => user.audience ?? null;

// ---------------------------------------------------------------- prompt text

function describeAreas(region: RegionInfo) {
  return region.areas.map((a) => `\`${a.name}\`${a.description ? ` ${a.description}` : ""}`).join(", ");
}

function pipelineText(ctx: BuilderContext, region: RegionInfo) {
  const contextKeys = Object.keys(ctx.config.context ?? {}).map((k) => k.replace(/[_-]+/g, " "));
  const conditions = ["the request", ...contextKeys];
  const multipleRegions = Object.keys(ctx.regions).length > 1;
  return `How the pipeline works:
- A spec is JSON that fully determines one person's interface: ${multipleRegions ? "for each region of the page, " : ""}views, each a layout of slots, each slot an instance of a library component with prop values.${ctx.config.catalog ? `\n- ${ctx.config.catalog.about}` : ""}
- At runtime a fast model, the decider, serves the interface. For every request it picks one view by reading each view's \`purpose\`, picks one option for each prop listed in a slot's \`adaptive\` array, and flags requests no view can serve. The decider reads literally and generates nothing; it only chooses among what the spec defines. Fixed props never change at runtime.
- Most people get the shared default spec. Specs exist per person only when the default does not serve them.

Spec rules:
- \`purpose\`: one or two literal sentences naming the requests a view answers. Purposes must be clearly distinct, because the decider routes requests by them. Name only requests the view's \`${region.primary}\` slot answers; do not claim requests another view's main content already answers, such as plain lists for a chart view with a list beside it.
- Fixed props (\`props\`) encode stable preferences. Make a prop adaptive only when the right option depends on ${conditions.length > 1 ? `${conditions.slice(0, -1).join(", ")} or ${conditions.at(-1)}` : conditions[0]}. Every adaptive prop costs one decider question per request.
- Areas: ${describeAreas(region)}. Layouts: ${region.layouts.map((l) => `'${l.id}' (${l.description})`).join(", ")}.
- ${ctx.config.library.some((d) => d.audiences) ? "Use only components whose audiences include the person's audience. " : ""}View ids and slot ids are kebab-case and unique within their scope.
- Refer to the person by name. Their pronouns are not known, so do not use gendered pronouns in any text you write.`;
}

const extra = (ctx: BuilderContext) => (ctx.config.prompts?.builder ? `\n\n${ctx.config.prompts.builder.trim()}` : "");
const who = (input: RunInput) => `"${input.userId}" (${[input.user.name, input.user.audience].filter(Boolean).join(", ") || "no name given"})`;

// ---------------------------------------------------------------- reading tools

function propForModel(prop: PropDefinition) {
  return {
    kind: prop.kind,
    label: prop.label,
    ...(prop.catalog ? { catalog: prop.catalog } : {}),
    default: prop.default,
    options: prop.options,
    ...(prop.kind === "param" ? { schema: prop.schema } : {}),
  };
}

function readingTools(ctx: BuilderContext, input: RunInput): Tool[] {
  const audience = audienceOf(input.user);
  const tools: Tool[] = [
    {
      name: "get_user",
      description: "Who the person is: their needs in their own words, usage signals, and a summary of their data.",
      input: {},
      readOnly: true,
      run: async () => {
        const { fixture: _f, ...user } = input.user;
        return ok({ id: input.userId, ...user });
      },
    },
    {
      name: "library_list",
      description: `Every component the person can use, with its props (each prop's kind, options and default)${ctx.config.catalog ? " and catalog entry" : ""}.`,
      input: {},
      readOnly: true,
      run: async () =>
        ok(
          Object.values(await ctx.libraryFor(input.userId))
            .filter((d) => supports(d, audience))
            .map(serializeComponent)
            .map((d) => ({
              id: d.id,
              title: d.title,
              description: d.description,
              ...(d.audiences ? { audiences: d.audiences } : {}),
              ...(d.catalog ? { catalog: d.catalog } : {}),
              source: d.source,
              ...(d.scope ? { scope: d.scope } : {}),
              props: Object.fromEntries(Object.entries(d.props).map(([k, p]) => [k, propForModel(p)])),
            })),
        ),
    },
    ...(ctx.config.catalog?.tools ?? []),
  ];
  return tools;
}

function authoringReadTools(ctx: BuilderContext, input: RunInput): Tool[] {
  const { kit, design } = ctx.config;
  return [
    {
      name: "kit_reference",
      description: "The component contract: module shape, data hooks and helpers for generated components.",
      input: {},
      readOnly: true,
      run: async () => (kit ? ok(kit.reference) : fail("this app has no kit, so components cannot be written")),
    },
    {
      name: "design_reference",
      description: "The design rules generated components must follow, and the text and background colours that are safe together.",
      input: {},
      readOnly: true,
      run: async () =>
        design
          ? ok(`${design.rules.trim()}\n\nSafe text and background pairs: ${describeSafePairs(design)}.\nText colours safe on plain surfaces: ${design.textColors.map((t) => `var(${t})`).join(", ")}.`)
          : fail("this app has no design contract"),
    },
    {
      name: "read_component",
      description: "Source of an existing component (builtin or generated), to follow its idiom.",
      input: { id: z.string() },
      readOnly: true,
      run: async ({ id }) => {
        const def = (await ctx.libraryFor(input.userId))[id as string];
        if (!def) return fail(`no component '${id}'`);
        const source = def.source === "builtin" ? await ctx.config.sources?.(def.id) : await ctx.config.storage.componentSource(def.id);
        return source ? ok(source) : fail("source not available");
      },
    },
  ];
}

// ---------------------------------------------------------------- personalize

export function personalizeRun(ctx: BuilderContext, input: RunInput) {
  const audience = audienceOf(input.user);
  const region = ctx.regions[input.region]!;
  let submitted = false;

  const submit: Tool = {
    name: "submit_spec",
    description: "Validate and save the person's personalized spec. Returns errors to fix, or confirms the saved version.",
    input: {
      profile: z.string().max(900).describe("3 to 6 short factual sentences about the person that help the decider choose. Facts, not instructions."),
      home: z.string().describe("id of the view to open by default"),
      views: z.array(View).min(1).max(6),
      rationale: z.array(z.string()).describe("One line per notable decision, citing the need or signal it answers"),
      summary: z.string().describe("One sentence describing this spec for the changelog"),
    },
    run: async (raw) => {
      const base = await ctx.specOf(input.userId, audience);
      const views = z.array(View).safeParse(raw.views);
      if (!views.success) return fail(zodErrors(views.error));
      const result = await ctx.commitSpec({
        userId: input.userId,
        audience,
        base,
        region: input.region,
        regionSpec: { home: String(raw.home), views: personalViews(views.data) },
        profile: String(raw.profile),
        rationale: raw.rationale as string[],
        by: "personalize",
        summary: String(raw.summary),
        runId: input.runId,
      });
      if ("errors" in result) return fail(result.errors.join("\n"));
      submitted = true;
      return ok(`Saved spec version ${result.spec.version}.`);
    },
  };

  return {
    tools: [...readingTools(ctx, input), submit],
    done: () => submitted,
    system: `You design personalized interface specs in a generative UI pipeline for ${ctx.config.domain}.

${pipelineText(ctx, region)}

Your job: design one person's ${Object.keys(ctx.regions).length > 1 ? `views for the \`${region.name}\` region` : "spec"} from their stated needs, their usage signals and their data, then submit it.

Steps:
1. get_user, then library_list.${ctx.config.catalog ? " Use catalog_get on a component's catalog entry when the design space behind a prop would help you decide." : ""}
2. submit_spec. If it returns errors, fix them and submit again.

Design:
- 3 to 5 views, ordered by how often this person needs them. \`home\` is the view they need most on opening the app.
- Let the person's data and habits drive fixed props: a phone-first person wants readable, single-column choices; someone who acts in bulk wants dense tables with selection; a constraint such as a work schedule should shape filters and ranking.
- Leave out views the person does not need. Do not invent components; requests the library cannot serve are handled later by a separate agent.${extra(ctx)}

When submit_spec succeeds, reply with one sentence summarizing the spec.`,
    prompt: async () => {
      const spec = await ctx.specOf(input.userId, audience);
      const current = ctx.regionSpecOf(spec, input.region, audience);
      return `Design a personalized spec for person ${who(input)}. Their current views are ${spec.userId ? `from their spec, version ${spec.version}` : "the shared default"}:\n\n${JSON.stringify(current, null, 1)}`;
    },
  };
}

// ---------------------------------------------------------------- extend

const PropInput = z.object({
  kind: z.enum(["choice", "param"]).default("choice"),
  label: z.string().describe("Short name the decider reads, such as 'Bin size'"),
  catalog: z.string().optional().describe("Catalog sub-dimension key this prop realizes"),
  default: z.string().describe("Option key used when nothing else is chosen"),
  options: z
    .object({})
    .catchall(z.union([z.string(), z.object({ value: z.unknown(), when: z.string() })]))
    .describe("choice: option key -> literal description of what it shows. param: option key -> { value, when }"),
  schema: z.object({}).catchall(z.unknown()).optional().describe("param only: JSON Schema every option's value must match"),
});

function toPropDefinition(key: string, p: z.infer<typeof PropInput>): PropDefinition | string {
  if (p.kind === "choice") {
    const options: Record<string, string> = {};
    for (const [k, o] of Object.entries(p.options)) {
      if (typeof o !== "string") return `prop '${key}' is a choice prop, so option '${k}' must be a description string`;
      options[k] = o;
    }
    return { kind: "choice", label: p.label, default: p.default, options, ...(p.catalog ? { catalog: p.catalog } : {}) };
  }
  if (!p.schema) return `prop '${key}' is a param prop and needs a schema`;
  const options: ParamProp["options"] = {};
  for (const [k, o] of Object.entries(p.options)) {
    if (typeof o === "string") return `prop '${key}' is a param prop, so option '${k}' must be { value, when }`;
    options[k] = o;
  }
  return { kind: "param", label: p.label, default: p.default, options, schema: p.schema as JsonSchema, ...(p.catalog ? { catalog: p.catalog } : {}) };
}

/** What a rewrite of an installed component removes: audiences, props or prop options. */
function droppedFrom(prev: ComponentDef, next: ComponentDef) {
  return [
    ...(prev.audiences && next.audiences ? prev.audiences.filter((a) => !next.audiences!.includes(a)).map((a) => `audience '${a}'`) : []),
    ...(!prev.audiences && next.audiences ? ["audiences: it supported every audience"] : []),
    ...Object.entries(prev.props).flatMap(([key, p]) =>
      !next.props[key]
        ? [`prop '${key}'`]
        : Object.keys(p.options)
            .filter((o) => !(o in next.props[key]!.options))
            .map((o) => `option '${key}.${o}'`),
    ),
  ];
}

function describeUnmatched(unmatched: Unmatched[], library: Record<string, ComponentDef>) {
  return unmatched
    .map((u) => {
      const def = library[u.component];
      const prop = def?.props[u.prop];
      const options = Object.entries(prop?.options ?? {}).map(([id, d]) => `    - ${id}: ${typeof d === "string" ? d : d.when}`);
      return `- "${u.label}" (${prop?.kind ?? "unknown"} prop \`${u.prop}\`) of ${def?.source ?? "unknown"} component \`${u.component}\` in slot \`${u.slotId}\`, options:\n${options.join("\n")}`;
    })
    .join("\n");
}

/** Why generated components cannot be verified, and so cannot be installed, on this server; null when they can. */
export function verificationProblem(config: MalleableConfig) {
  if (!config.verifier) return "no verifier is configured";
  if (!config.kit) return "no kit is configured";
  if (!config.design) return "no design contract is configured";
  if (!config.fixtures) return "no fixtures are configured";
  return config.verifier.unavailable?.() ?? null;
}

export type ExtendInput = RunInput & { request: string; gapKind: string; unmatched: Unmatched[] };

export function extendRun(ctx: BuilderContext, input: ExtendInput) {
  const { config } = ctx;
  const audience = audienceOf(input.user);
  const region = ctx.regions[input.region]!;
  const imports = config.kit?.imports ?? [];
  let patched = false;

  /** The person's current views in this region, branching off the default when they have no spec yet. */
  const current = async () => {
    const base = await ctx.specOf(input.userId, audience);
    const rs = ctx.regionSpecOf(base, input.region, audience);
    return { base, home: rs.home, views: personalViews(structuredClone(rs.views)) };
  };

  const fixturesFor = (def: ComponentDef): Fixture[] => {
    const list = (config.fixtures?.list ?? []).filter((f) => supports(def, f.audience));
    const mine = input.user.fixture;
    return [...list.filter((f) => f.id === mine), ...list.filter((f) => f.id !== mine)];
  };

  const unavailable = () => verificationProblem(config);
  const serverProblem = (why: string) =>
    fail(`Not installed: verification could not run on this server (${why}). This is a server problem, not a problem with the component. Stop and report it.`);

  /** Runs the verifier. Returns errors for the model, or a ToolResult when the server itself cannot verify. */
  async function verify(def: ComponentDef, code: string, options?: Slot["options"]): Promise<string[] | ToolResult> {
    const why = unavailable();
    if (why) return serverProblem(why);
    const fixtures = fixturesFor(def);
    if (!fixtures.length) return [`no fixture can render this component: none has one of its audiences (${def.audiences?.join(", ")})`];
    try {
      return await config.verifier!.verify({
        def,
        code,
        fixtures,
        fixtureProvider: config.fixtures!.provider,
        kit: config.kit!,
        design: config.design!,
        ...(options ? { options } : {}),
      });
    } catch (e) {
      if (e instanceof VerifierUnavailable) return serverProblem(e.message);
      throw e;
    }
  }

  const writeComponent: Tool = {
    name: "write_component",
    description:
      "Write a component, check its source, compile it, render it for every prop option and every eligible fixture in a real browser in each theme, audit its text for contrast, overlap and size, and install it for this person if it passes. Returns errors to fix.",
    input: {
      id: z.string().regex(ID).describe("kebab-case id, not already used by a builtin"),
      title: z.string(),
      description: z.string().describe("What it shows and lets the person do, literal, one or two sentences"),
      ...(config.catalog ? { catalog: z.string().describe("Catalog entry id it instantiates") } : {}),
      ...(config.library.some((d) => d.audiences) ? { audiences: z.array(z.string()).min(1).optional().describe("Audiences whose data it can show") } : {}),
      props: z.object({}).catchall(PropInput).describe("1 to 3 props, keyed by prop name"),
      code: z.string().describe("Complete TSX module source"),
    },
    run: async (raw) => {
      const why = unavailable();
      if (why) return serverProblem(why);
      const id = String(raw.id);
      if (ctx.builtins[id]) return fail(`'${id}' is a builtin id; choose another`);
      const existing = (await config.storage.components()).find((d) => d.id === id);
      if (existing && (existing.scope === "shared" || existing.origin?.userId !== input.userId))
        return fail(`'${id}' is already used by another component; choose another id`);
      const props: Record<string, PropDefinition> = {};
      const rawProps = z.object({}).catchall(PropInput).safeParse(raw.props);
      if (!rawProps.success) return fail(zodErrors(rawProps.error));
      for (const [key, p] of Object.entries(rawProps.data)) {
        const prop = toPropDefinition(key, p);
        if (typeof prop === "string") return fail(prop);
        props[key] = prop;
      }
      const def: ComponentDef = {
        id,
        version: (existing?.version ?? 0) + 1,
        title: String(raw.title),
        description: String(raw.description),
        ...(raw.audiences ? { audiences: raw.audiences as string[] } : {}),
        ...(raw.catalog ? { catalog: String(raw.catalog) } : {}),
        source: "generated",
        props,
        scope: "private",
        origin: existing?.origin ?? { request: input.request, userId: input.userId, createdAt: new Date().toISOString(), runId: input.runId },
      };
      const defErrors = checkComponentDef(def);
      if (defErrors.length) return fail(defErrors.join("\n"));
      if (existing) {
        const dropped = droppedFrom(existing, def);
        if (dropped.length)
          return fail(`'${id}' is already installed and the person's spec may use it. A rewrite must keep everything it had; missing: ${dropped.join(", ")}`);
      }
      const source = String(raw.code);
      const staticErrors = config.verifier!.check(source, { imports });
      if (staticErrors.length) return fail(`Not installed.\n${staticErrors.join("\n")}`);
      const compiled = await config.verifier!.compile(source, { imports });
      if ("errors" in compiled) return fail(`Not installed: it does not compile.\n${compiled.errors.join("\n")}`);
      const errors = await verify(def, compiled.code);
      if (!Array.isArray(errors)) return errors;
      if (errors.length) return fail(`Not installed.\n${errors.join("\n")}`);
      await ctx.installComponent({ ...def, artifact: { hash: compiled.hash } }, source, compiled.code, input.runId);
      return ok(
        `Installed '${id}' for this person. Every prop option rendered and passed the legibility audit. Add it to the spec with submit_spec_patch.`,
      );
    },
  };

  const patchSpec: Tool = {
    name: "submit_spec_patch",
    description: "Add or replace views in the person's spec and save a new version. Returns errors to fix.",
    input: {
      views: z.array(View).describe("Views to add, or to replace when the id already exists"),
      removeViews: z.array(z.string()).optional(),
      home: z.string().optional(),
      summary: z.string().describe("One sentence for the changelog"),
    },
    run: async (raw) => {
      const parsed = z.array(View).safeParse(raw.views);
      if (!parsed.success) return fail(zodErrors(parsed.error));
      const { base, home, views: existing } = await current();
      const remove = (raw.removeViews as string[] | undefined) ?? [];
      const views = existing.filter((v) => !remove.includes(v.id));
      for (const view of personalViews(parsed.data)) {
        const i = views.findIndex((x) => x.id === view.id);
        if (i >= 0) views[i] = view;
        else views.push(view);
      }
      const result = await ctx.commitSpec({
        userId: input.userId,
        audience,
        base,
        region: input.region,
        regionSpec: { home: (raw.home as string | undefined) ?? home, views },
        by: "extend",
        summary: String(raw.summary),
        runId: input.runId,
      });
      if ("errors" in result) return fail(result.errors.join("\n"));
      patched = true;
      return ok(`Saved spec version ${result.spec.version}.`);
    },
  };

  const addOption: Tool = {
    name: "add_option",
    description:
      "Add an option to one `param` prop of one slot in the person's spec, for a value none of the component's options gives. Works for builtin and generated components; a generated component is rendered again with the new value first. Saves a new spec version. Returns errors to fix.",
    input: {
      view: z.string(),
      slot: z.string(),
      prop: z.string(),
      key: z.string().regex(ID).describe("kebab-case option key"),
      value: z.unknown().describe("The value the component receives; must match the prop's schema"),
      when: z.string().describe("Literal description of exactly what this option shows, naming its values"),
      use: z.enum(["adaptive", "fixed"]).default("adaptive").describe("adaptive: the decider may pick it per request. fixed: always use it in this slot"),
      summary: z.string().describe("One sentence for the changelog"),
    },
    run: async (raw) => {
      const { base, home, views } = await current();
      const view = views.find((v) => v.id === raw.view);
      if (!view) return fail(`no view '${raw.view}' (${views.map((v) => v.id).join(", ")})`);
      const slot = view.slots.find((s) => s.id === raw.slot);
      if (!slot) return fail(`view '${view.id}' has no slot '${raw.slot}' (${view.slots.map((s) => s.id).join(", ")})`);
      const def = (await ctx.libraryFor(input.userId))[slot.component];
      const key = String(raw.prop);
      const prop = def?.props[key];
      if (!def || !prop) return fail(`'${slot.component}' has no prop '${key}'`);
      if (prop.kind !== "param") return fail(`'${def.id}.${key}' is a choice prop; options can only be added to param props. Write a component instead.`);
      const optionKey = String(raw.key);
      if (optionKey in optionsOf(def, slot, key)) return fail(`'${key}' already has an option '${optionKey}'`);
      const issues = checkParamValue(prop, raw.value);
      if (issues.length) return fail(`value does not match the schema of '${def.id}.${key}':\n${issues.join("\n")}`);

      slot.options = { ...slot.options, [key]: { ...slot.options?.[key], [optionKey]: { value: raw.value, when: String(raw.when) } } };
      if (raw.use === "fixed") {
        slot.props = { ...slot.props, [key]: optionKey };
        slot.adaptive = slot.adaptive.filter((k) => k !== key);
      } else {
        const { [key]: _fixed, ...props } = slot.props;
        slot.props = props;
        if (!slot.adaptive.includes(key)) slot.adaptive = [...slot.adaptive, key];
      }

      if (def.source === "generated") {
        const code = def.artifact ? await config.storage.artifact(def.artifact.hash) : null;
        if (!code) return fail(`the compiled module of '${def.id}' is missing; rewrite it with write_component`);
        const errors = await verify(def, code, slot.options);
        if (!Array.isArray(errors)) return errors;
        if (errors.length) return fail(`Not added: '${def.id}' fails with the new value.\n${errors.join("\n")}`);
      }

      const result = await ctx.commitSpec({
        userId: input.userId,
        audience,
        base,
        region: input.region,
        regionSpec: { home, views },
        by: "extend",
        summary: String(raw.summary),
        runId: input.runId,
      });
      if ("errors" in result) return fail(result.errors.join("\n"));
      patched = true;
      return ok(`Added option '${optionKey}' to ${view.id}/${slot.id}.${key} (${raw.use === "fixed" ? "fixed" : "adaptive"}). Saved spec version ${result.spec.version}.`);
    },
  };

  const catalog = config.catalog;
  return {
    tools: [...readingTools(ctx, input), ...authoringReadTools(ctx, input), writeComponent, patchSpec, addOption],
    done: () => patched,
    system: `You extend a person's interface spec in a generative UI pipeline for ${config.domain}. The decider, the fast model serving the interface, flagged a request that no view in the person's spec can serve.

${pipelineText(ctx, region)}

First decide: can existing library components, arranged in a new or changed view, answer the request? If so, only patch the spec. Check every condition and every value in the request against the components' prop options: a component only filters, sorts, groups and bins by the options it lists, and builtin components cannot be edited. If the request needs something no component shows or offers, such as a new visualization, diagram, data view, or a filter or sort order a list lacks, write a new component and then add it to the spec. For a missing filter, expose it as a prop whose options include the unfiltered case, so the component serves other requests too.

When the decider reports that a view fits but one of its settings has no option for what the request asks, such as ranges of 0–2 and 2–4 when the options are one-point and half-point ranges:
- If that prop is a \`param\` prop, add the option the request needs to that slot with add_option, and the nearby variants people are likely to ask for next with further add_option calls. This works for builtin and generated components alike.
- Otherwise, if the component is generated and this person's own, extend it in place: read_component, then write_component with the same id, keeping every prop, option and audience it already has, and adding the options the request needs. Then make the setting adaptive in the view with submit_spec_patch if it is fixed there. Do not add a second component that duplicates it.
- Otherwise write a new component that covers the request and add it to a view.

Options the decider can choose correctly:
- When a request names particular values, such as ranges, cut-offs, groups, periods or counts, the options must include exactly those values, and also the nearby variants people are likely to ask for next, such as other common splits, so the next similar request is served without another run. When the values people ask for can vary, as with ranges and cut-offs, prefer options that cover a family of splits (two, four or eight equal ranges; above and below common cut-offs) over one option per past request. A \`param\` prop is the natural fit: its options carry values, so the component does not need a branch per option.
- Describe each option by exactly what it shows, naming its values, for example "Two ranges: 0–2 and 2–4". Never write that an option is right for requests it does not literally serve, such as "right unless the request asks for finer ranges": the decider rounds a request to the option whose description claims it, and then cannot tell that the request needed something else.

Writing a component:
- Read kit_reference and design_reference first. Read one similar existing component with read_component for idiom.
- ${catalog ? "Pick the catalog entry it instantiates (catalog_search, catalog_get). Expose 1 to 3 of that entry's sub-dimensions as props" : "Expose 1 to 3 props"} with 2 to 6 literal options each, so the decider can adapt it and others can reuse it.
- Compute from the person's data through the kit hooks. Never hard-code this person's values: the component is private to them at first, but a reviewer may promote it to everyone.
- Legibility is enforced: use only the text and background pairs design_reference lists as safe.
- write_component checks the source, then renders every prop option with the data of every fixture that can use it, in a real browser in each theme, and measures every piece of text against what is painted behind it. If it returns errors, fix the code and call it again.

Patching the spec: add a view whose purpose literally covers requests like the flagged one and contains the new component, alongside existing components when they help. Keep other views unless replacing one on purpose.${extra(ctx)}

When submit_spec_patch or add_option succeeds, reply with one sentence.`,
    prompt: async () => {
      const spec = await ctx.specOf(input.userId, audience);
      const rs = ctx.regionSpecOf(spec, input.region, audience);
      const library = await ctx.libraryFor(input.userId);
      return `Flagged request from person ${who(input)}: "${input.request}"
The decider's guess at what is missing: ${input.gapKind}.
${input.unmatched.length ? `The view the decider served fits, but no option of these settings matches the request:\n${describeUnmatched(input.unmatched, library)}\n` : ""}
Their current spec (version ${spec.version}${spec.userId ? "" : ", the shared default"}):
${JSON.stringify({ profile: spec.profile, home: rs.home, views: rs.views }, null, 1)}`;
    },
  };
}
