import { createSdkMcpServer, query, tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Persona } from "../../shared/personas";
import { checkPropDefs, checkSpec, ComponentDef, PropDef, Spec, View, viewsFor } from "../../shared/spec";
import { getAtlasEntry, searchAtlas } from "../atlas";
import { emit } from "../events";
import { addGenerated, COMPONENT_DIR, getLibrary, getSpec, ROOT, saveSpec, STAGING_DIR } from "../store";
import { checkComponent } from "./check";
import { describeUser } from "./context";

// The "more powerful" side of the pipeline: Claude, through the Agent SDK, writes
// specs and code. It sees no built-in tools, only the in-process tools below, so
// everything it produces passes through validation before the app can use it.

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
const TOOL_PREFIX = "mcp__genui__";

const active = new Map<string, string>(); // userId -> runId
export const activeRun = (userId: string) => active.get(userId) ?? null;

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ ...text(message), isError: true });

function libraryFor(role: "student" | "advisor") {
  return Object.values(getLibrary())
    .filter((c) => c.roles.includes(role))
    .map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      atlas: c.atlas,
      source: c.source,
      props: Object.fromEntries(
        Object.entries(c.props).map(([k, p]) => [k, { label: p.label, atlas: p.atlas, default: p.default, options: p.options }]),
      ),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = SdkMcpToolDefinition<any>;

const sharedTools = (persona: Persona): AnyTool[] => [
  tool("get_user", "Who the user is: their needs in their own words, usage signals, and a summary of their data.", {}, async () =>
    text(describeUser(persona)),
  { annotations: { readOnlyHint: true } }),
  tool(
    "library_list",
    "Every component the user's role can use, with its Pattern Atlas entry and props (each prop's options and default).",
    {},
    async () => text(libraryFor(persona.subject.kind)),
    { annotations: { readOnlyHint: true } },
  ),
  tool(
    "atlas_search",
    "Keyword search over the Pattern Atlas, a catalog of 119 UI design patterns and their design spaces.",
    { query: z.string() },
    async ({ query }) => text(searchAtlas(query)),
    { annotations: { readOnlyHint: true } },
  ),
  tool(
    "atlas_get",
    "One Pattern Atlas entry with its dimensions, sub-dimensions (keys like 'chart.markType') and variations.",
    { id: z.string() },
    async ({ id }) => {
      const entry = getAtlasEntry(id);
      return entry ? text(entry) : fail(`no atlas entry '${id}'; use atlas_search`);
    },
    { annotations: { readOnlyHint: true } },
  ),
];

type RunResult = { ok: boolean; runId: string };

async function runAgent(opts: {
  kind: "personalize" | "extend";
  persona: Persona;
  system: string;
  prompt: string;
  tools: AnyTool[];
  effort: "low" | "medium" | "high" | "xhigh";
  done: () => boolean;
  request?: string;
}): Promise<RunResult> {
  const userId = opts.persona.id;
  if (active.has(userId)) throw new Error(`a Claude run is already in progress for ${userId}`);
  const runId = crypto.randomUUID().slice(0, 8);
  active.set(userId, runId);
  emit({ type: "claude.start", userId, runId, kind: opts.kind, model: CLAUDE_MODEL, request: opts.request });

  const server = createSdkMcpServer({ name: "genui", version: "1.0.0", tools: opts.tools });
  const started = Date.now();
  let costUsd = 0;
  let turns = 0;
  let error: string | undefined;
  try {
    for await (const message of query({
      prompt: opts.prompt,
      options: {
        model: CLAUDE_MODEL,
        effort: opts.effort,
        systemPrompt: opts.system,
        mcpServers: { genui: server },
        tools: [],
        allowedTools: [`${TOOL_PREFIX}*`],
        permissionMode: "dontAsk",
        settingSources: [],
        persistSession: false,
        maxTurns: 40,
        maxBudgetUsd: 6,
        cwd: ROOT,
        // Only our in-process tools: no claude.ai connectors or user MCP servers,
        // and load them upfront so the model never has to search for them.
        strictMcpConfig: true,
        env: { ...process.env, ENABLE_TOOL_SEARCH: "false" },
      },
    })) {
      if (message.type === "system" && message.subtype === "init") {
        const mine = message.tools.filter((t) => t.startsWith(TOOL_PREFIX));
        const status = message.mcp_servers.find((m) => m.name === "genui")?.status;
        if (process.env.DEBUG_AGENT) console.log("init", status, mine);
        if (status !== "connected" || mine.length < opts.tools.length)
          console.warn(`[agent ${runId}] genui MCP ${status}; ${mine.length}/${opts.tools.length} tools registered`);
      } else if (message.type === "assistant") {
        if (message.error) error = `assistant error: ${message.error}`;
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim()) emit({ type: "claude.text", userId, runId, text: block.text });
          if (block.type === "tool_use")
            emit({
              type: "claude.tool",
              userId,
              runId,
              toolUseId: block.id,
              name: block.name.replace(TOOL_PREFIX, ""),
              input: JSON.stringify(block.input).slice(0, 4000),
            });
        }
      } else if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (typeof block !== "object" || block.type !== "tool_result") continue;
          const body = Array.isArray(block.content)
            ? block.content.map((c) => (c.type === "text" ? c.text : "")).join("\n")
            : String(block.content ?? "");
          emit({ type: "claude.result", userId, runId, toolUseId: block.tool_use_id, ok: !block.is_error, summary: body.slice(0, 1500) });
        }
      } else if (message.type === "result") {
        costUsd = message.total_cost_usd;
        turns = message.num_turns;
        if (message.subtype !== "success") error = message.subtype;
      }
    }
  } catch (e) {
    error = (e as Error).message;
  } finally {
    active.delete(userId);
  }
  const ok = !error && opts.done();
  emit({
    type: "claude.done",
    userId,
    runId,
    ok,
    costUsd,
    durationMs: Date.now() - started,
    turns,
    error: error ?? (ok ? undefined : "the agent finished without submitting a valid result"),
  });
  return { ok, runId };
}

// ---------------------------------------------------------------- shared prompt text
const PIPELINE = `How the pipeline works:
- A spec is JSON that fully determines one user's interface: views, each a layout of slots, each slot an instance of a library component with prop values.
- Components instantiate patterns from the Pattern Atlas, a catalog of UI design patterns. A component's props are sub-dimensions of its atlas pattern, and a prop's options are that dimension's variations.
- At runtime a fast System One model, Jev, serves the interface. For every request it picks one view by reading each view's \`purpose\`, picks one option for each prop listed in a slot's \`adaptive\` array, and flags requests no view can serve. Jev reads literally and generates nothing; it only chooses among what the spec defines. Fixed props never change at runtime.
- Most users get the shared default spec. Specs exist per user only when the default does not serve them.

Spec rules:
- \`purpose\`: one or two literal sentences naming the requests a view answers. Purposes must be clearly distinct, because Jev routes requests by them.
- Fixed props (\`props\`) encode stable preferences. Make a prop adaptive only when the right option depends on the request, the device or the registration phase. Every adaptive prop costs one Jev question per request.
- Regions: \`top\` spans the full width above the rest (key numbers, notices), \`main\` is the primary column, \`aside\` is the secondary column. Layouts: 'main-aside' (wide main + narrow aside), 'stack' (one column), 'columns' (two equal columns).
- Use only components whose roles include the user's role. View ids and slot ids are kebab-case and unique within their scope.
- Refer to the user by name. Their pronouns are not known, so do not use gendered pronouns in any text you write.`;

// ---------------------------------------------------------------- personalize
const SubmitSpec = {
  profile: z.string().max(900).describe("3 to 6 short factual sentences about the user that help Jev choose. Facts, not instructions."),
  home: z.string().describe("id of the view to open by default"),
  views: z.array(View).min(2).max(6),
  rationale: z.array(z.string()).describe("One line per notable decision, citing the need or signal it answers"),
  summary: z.string().describe("One sentence describing this spec for the changelog"),
};

export function personalize(persona: Persona) {
  let submitted = false;
  const role = persona.subject.kind;
  const base = getSpec(persona.id);

  const submit = tool(
    "submit_spec",
    "Validate and save the user's personalized spec. Returns errors to fix, or confirms the saved version.",
    SubmitSpec,
    async (input) => {
      const spec: Spec = {
        id: `spec-${persona.id}`,
        version: base.userId ? base.version + 1 : 1,
        userId: persona.id,
        parent: `${base.id}@${base.version}`,
        profile: input.profile,
        home: input.home,
        views: input.views.map(({ roles: _roles, ...v }) => v),
        rationale: input.rationale,
        changelog: [
          ...(base.userId ? base.changelog : []),
          { version: base.userId ? base.version + 1 : 1, at: new Date().toISOString(), by: "claude-personalize", summary: input.summary },
        ],
      };
      const parsed = Spec.safeParse(spec);
      if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      const errors = checkSpec(parsed.data, getLibrary(), role);
      if (errors.length) return fail(errors.join("\n"));
      saveSpec(persona.id, parsed.data);
      submitted = true;
      emit({ type: "spec.version", userId: persona.id, version: parsed.data.version, by: "claude-personalize", summary: input.summary });
      return text(`Saved spec version ${parsed.data.version}.`);
    },
  );

  return runAgent({
    kind: "personalize",
    persona,
    effort: (process.env.CLAUDE_PERSONALIZE_EFFORT as "medium") ?? "medium",
    tools: [...sharedTools(persona), submit],
    done: () => submitted,
    system: `You design personalized interface specs in a generative UI pipeline for a university course-planning app.

${PIPELINE}

Your job: design one user's spec from their stated needs, their usage signals and their data, then submit it.

Steps:
1. get_user, then library_list. Use atlas_get on a component's atlas entry when the design space behind a prop would help you decide.
2. submit_spec. If it returns errors, fix them and submit again.

Design:
- 3 to 5 views, ordered by how often this user needs them. \`home\` is the view they need most on opening the app.
- Let the user's data and habits drive fixed props: a phone-first user wants readable, single-column choices; someone who acts in bulk wants dense tables with selection; a constraint such as a work schedule should shape filters and ranking.
- Leave out views the user does not need. Do not invent components; requests the library cannot serve are handled later by a separate agent.

When submit_spec succeeds, reply with one sentence summarizing the spec.`,
    prompt: `Design a personalized spec for user "${persona.id}" (${persona.name}, ${role}). Their current spec is the shared default:\n\n${JSON.stringify(
      { home: base.home, views: viewsFor(base, role) },
      null,
      1,
    )}`,
  });
}

// ---------------------------------------------------------------- extend
const WriteComponent = {
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).describe("kebab-case id, not already used by a builtin"),
  title: z.string(),
  description: z.string().describe("What it shows and lets the person do, literal, one or two sentences"),
  atlas: z.string().describe("Pattern Atlas entry id it instantiates"),
  roles: z.array(z.enum(["student", "advisor"])).min(1),
  props: z.object({}).catchall(PropDef).describe("1 to 3 props taken from the atlas entry's sub-dimensions, keyed by prop name"),
  code: z.string().describe("Complete TSX module source"),
};

const PatchSpec = {
  views: z.array(View).describe("Views to add, or to replace when the id already exists"),
  removeViews: z.array(z.string()).optional(),
  home: z.string().optional(),
  summary: z.string().describe("One sentence for the changelog"),
};

export function extend(persona: Persona, request: string, gapKind: string) {
  let patched = false;
  let attempt = 0;
  const role = persona.subject.kind;
  const kitReference = readFileSync(join(ROOT, "web/src/kit/KIT.md"), "utf8");

  const tools: AnyTool[] = [
    ...sharedTools(persona),
    tool("kit_reference", "The component contract: module shape, data hooks, helpers and design rules for generated components.", {}, async () => text(kitReference), {
      annotations: { readOnlyHint: true },
    }),
    tool(
      "read_component",
      "Source of an existing component (builtin or generated), to follow its idiom.",
      { id: z.string() },
      async ({ id }) => {
        const def = getLibrary()[id];
        if (!def) return fail(`no component '${id}'`);
        const path =
          def.source === "builtin" ? join(ROOT, "web/src/components", `${id}.tsx`) : join(COMPONENT_DIR, `${id}.tsx`);
        return existsSync(path) ? text(readFileSync(path, "utf8")) : fail("source not found");
      },
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      "write_component",
      "Write a new component, render it server-side with the user's data for every prop option, and install it into the shared library if it passes. Returns errors to fix.",
      WriteComponent,
      async (input) => {
        const library = getLibrary();
        if (library[input.id]?.source === "builtin") return fail(`'${input.id}' is a builtin id; choose another`);
        const def: ComponentDef = {
          id: input.id,
          title: input.title,
          description: input.description,
          atlas: input.atlas,
          source: "generated",
          roles: input.roles,
          props: input.props,
          origin: { request, userId: persona.id, createdAt: new Date().toISOString(), runId: activeRun(persona.id) ?? "" },
        };
        const parsed = ComponentDef.safeParse(def);
        if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
        const propErrors = checkPropDefs(parsed.data.props);
        if (propErrors.length) return fail(propErrors.join("\n"));
        const staged = join(STAGING_DIR, `${input.id}-${++attempt}.tsx`);
        writeFileSync(staged, input.code);
        const errors = await checkComponent(staged, parsed.data, persona.subject);
        if (errors.length) return fail(`Not installed.\n${errors.join("\n")}`);
        renameSync(staged, join(COMPONENT_DIR, `${input.id}.tsx`));
        addGenerated(parsed.data);
        emit({ type: "component.installed", userId: persona.id, componentId: input.id, title: input.title, runId: activeRun(persona.id) ?? "" });
        return text(`Installed '${input.id}'. Every prop option rendered without errors. Add it to the spec with submit_spec_patch.`);
      },
    ),
    tool(
      "submit_spec_patch",
      "Add or replace views in the user's spec and save a new version. Returns errors to fix.",
      PatchSpec,
      async (input) => {
        const current = getSpec(persona.id);
        // Branching off the shared default keeps only the views this role can see.
        const baseViews = current.userId ? current.views : viewsFor(current, role).map(({ roles: _r, ...v }) => v);
        const views = baseViews.filter((v) => !(input.removeViews ?? []).includes(v.id));
        for (const v of input.views) {
          const { roles: _roles, ...view } = v;
          const i = views.findIndex((x) => x.id === view.id);
          if (i >= 0) views[i] = view;
          else views.push(view);
        }
        const next: Spec = {
          ...current,
          id: `spec-${persona.id}`,
          userId: persona.id,
          version: current.userId ? current.version + 1 : 1,
          parent: `${current.id}@${current.version}`,
          home: input.home ?? current.home,
          views,
          changelog: [
            ...(current.userId ? current.changelog : []),
            { version: current.userId ? current.version + 1 : 1, at: new Date().toISOString(), by: "claude-extend", summary: input.summary },
          ],
        };
        const errors = checkSpec(next, getLibrary(), role);
        if (errors.length) return fail(errors.join("\n"));
        saveSpec(persona.id, next);
        patched = true;
        emit({ type: "spec.version", userId: persona.id, version: next.version, by: "claude-extend", summary: input.summary });
        return text(`Saved spec version ${next.version}.`);
      },
    ),
  ];

  const spec = getSpec(persona.id);
  return runAgent({
    kind: "extend",
    persona,
    request,
    effort: (process.env.CLAUDE_EXTEND_EFFORT as "high") ?? "high",
    tools,
    done: () => patched,
    system: `You extend a user's interface spec in a generative UI pipeline for a university course-planning app. Jev, the fast model serving the interface, flagged a request that no view in the user's spec can serve.

${PIPELINE}

First decide: can existing library components, arranged in a new or changed view, answer the request? If so, only patch the spec. Check every condition in the request against the components' prop options: a component only filters and sorts by the options it lists, and builtin components cannot be edited. If the request needs something no component shows or offers, such as a new visualization, diagram, data view, or a filter or sort order a list lacks, write a new component and then add it to the spec. For a missing filter, expose it as a prop whose options include the unfiltered case, so the component serves other requests too.

Writing a component:
- Read kit_reference first. Read one similar existing component with read_component for idiom (demand-chart for SVG charts, advisee-table for tables).
- Pick the Pattern Atlas entry it instantiates (atlas_search, atlas_get). Expose 1 to 3 of that entry's sub-dimensions as props with 2 to 4 literal options each, so Jev can adapt it and other users can reuse it.
- Compute from the subject's data through the kit hooks. Never hard-code this user's values; the component joins a shared library.
- write_component renders every prop option with this user's data. If it returns errors, fix the code and call it again.

Patching the spec: add a view whose purpose literally covers requests like the flagged one and contains the new component, alongside existing components when they help. Keep other views unless replacing one on purpose.

When submit_spec_patch succeeds, reply with one sentence.`,
    prompt: `Flagged request from user "${persona.id}" (${persona.name}, ${role}): "${request}"
Jev's guess at what is missing: ${gapKind}.

Their current spec (version ${spec.version}${spec.userId ? "" : ", the shared default"}):
${JSON.stringify({ profile: spec.profile, home: spec.home, views: spec.views }, null, 1)}`,
  });
}
