import {
  checkSpec,
  DEFAULT_THRESHOLDS,
  normalizeSpec,
  regionInfo,
  serializeComponent,
  Spec,
  supports,
  viewsFor,
  type BuilderRun,
  type ComponentDef,
  type Decision,
  type MalleableEventInput,
  type PersonalizeResponse,
  type RegionInfo,
  type RegionResponse,
  type RegionSpec,
  type ReviewResponse,
  type ServeRequest,
  type Thresholds,
  type Tool,
  type ToolResult,
} from "@malleable/core";
import { extendRun, personalizeRun, verificationProblem, type BuilderContext } from "./builder";
import type { MalleableConfig, UserDescription } from "./config";
import { eventBus } from "./events";
import { createHandler } from "./handler";
import { runGate, runServe, type GateRun } from "./serve";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const mapValues = <T, U>(o: Record<string, T>, f: (v: T, k: string) => U) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]));

export type Malleable = ReturnType<typeof createMalleable>;

export function createMalleable(config: MalleableConfig) {
  const { storage } = config;
  const basePath = (config.basePath ?? "/api/malleable").replace(/\/$/, "");
  const regions: Record<string, RegionInfo> = mapValues(config.regions, (c, name) => regionInfo(name, c));
  const defaults: Record<string, RegionSpec> = mapValues(config.regions, (c) => c.default);
  const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
  const prompts = config.prompts;
  const bus = eventBus();
  const emit = (e: MalleableEventInput) => bus.emit(e);

  const builtins: Record<string, ComponentDef> = {};
  for (const def of config.library) {
    if (builtins[def.id]) throw new Error(`two builtin components have the id '${def.id}'`);
    builtins[def.id] = def;
  }
  const serializedBuiltins = mapValues(builtins, serializeComponent);

  const defaultSpec: Spec = {
    id: "default",
    version: 1,
    userId: null,
    parent: null,
    profile: config.profile ?? "",
    regions: defaults,
    rationale: config.rationale ?? [],
    changelog: [{ version: 1, at: new Date(0).toISOString(), by: "default", summary: "The shared default spec" }],
  };
  const defaultErrors = checkSpec(defaultSpec, { library: builtins, regions, audience: null });
  if (defaultErrors.length) throw new Error(`the default spec is invalid:\n- ${defaultErrors.join("\n- ")}`);

  // ---------------------------------------------------------------- components

  let generatedCache: Promise<ComponentDef[]> | null = null;
  const generated = () => (generatedCache ??= storage.components());
  const invalidate = () => void (generatedCache = null);

  /** Builtins, shared generated components, and this person's own private ones. */
  async function libraryFor(userId: string | null): Promise<Record<string, ComponentDef>> {
    const lib = { ...builtins };
    for (const d of await generated())
      if (d.artifact && !builtins[d.id] && (d.scope === "shared" || (userId !== null && d.origin?.userId === userId))) lib[d.id] = d;
    return lib;
  }

  // ---------------------------------------------------------------- specs

  /** Writes to one person's spec run one at a time, so versions never collide. */
  const locks = new Map<string, Promise<unknown>>();
  function locked<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(userId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    locks.set(userId, tail);
    void tail.then(() => locks.get(userId) === tail && locks.delete(userId));
    return next;
  }

  function nextVersion(base: Spec, userId: string, patch: { regions: Spec["regions"]; profile?: string; rationale?: string[] }, by: Spec["changelog"][number]["by"], summary: string, runId?: string): Spec {
    const version = base.userId ? base.version + 1 : 1;
    return {
      id: `spec-${userId}`,
      version,
      userId,
      parent: `${base.id}@${base.version}`,
      profile: patch.profile ?? base.profile,
      regions: patch.regions,
      rationale: patch.rationale ?? base.rationale,
      changelog: [...(base.userId ? base.changelog : []), { version, at: new Date().toISOString(), by, summary, ...(runId ? { runId } : {}) }],
    };
  }

  /**
   * The person's current spec, brought in line with the app as it is now. A
   * saved spec that no longer checks, because a builtin changed, is migrated and
   * saved again with a system changelog entry.
   */
  async function specOf(userId: string, audience: string | null): Promise<Spec> {
    const latest = (await storage.specHistory(userId)).at(-1);
    if (!latest) return defaultSpec;
    const { spec, notes } = normalizeSpec(latest, { library: await libraryFor(userId), regions, audience, defaults });
    if (!notes.length) return spec;
    return locked(userId, async () => {
      const again = (await storage.specHistory(userId)).at(-1);
      if (again && again.version !== latest.version) return specOf(userId, audience);
      const next = nextVersion(latest, userId, { regions: spec.regions }, "system", `Updated to match the app: ${notes.join("; ")}`);
      await storage.saveSpec(userId, next);
      emit({ type: "spec.version", userId, version: next.version, by: "system", summary: next.changelog.at(-1)!.summary });
      return next;
    });
  }

  /** A region of a spec, falling back to the default for regions the person has not changed. */
  function regionSpecOf(spec: Spec, region: string, audience: string | null): RegionSpec {
    const rs = spec.regions[region] ?? defaults[region];
    if (!rs) throw new HttpError(400, `unknown region '${region}'`);
    const views = viewsFor(rs, audience);
    return { home: views.some((v) => v.id === rs.home) ? rs.home : views[0]!.id, views };
  }

  const commitSpec: BuilderContext["commitSpec"] = (input) =>
    locked(input.userId, async () => {
      const latest = (await storage.specHistory(input.userId)).at(-1);
      const base = latest ?? input.base;
      const next = nextVersion(
        base,
        input.userId,
        { regions: { ...(base.userId ? base.regions : {}), [input.region]: input.regionSpec }, profile: input.profile, rationale: input.rationale },
        input.by,
        input.summary,
        input.runId,
      );
      const parsed = Spec.safeParse(next);
      if (!parsed.success) return { errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
      const errors = checkSpec(parsed.data, { library: await libraryFor(input.userId), regions, audience: input.audience });
      if (errors.length) return { errors };
      await storage.saveSpec(input.userId, parsed.data);
      emit({ type: "spec.version", userId: input.userId, version: parsed.data.version, by: input.by, summary: input.summary, runId: input.runId });
      return { spec: parsed.data };
    });

  async function installComponent(def: ComponentDef, source: string, code: string, runId: string) {
    await storage.saveArtifact(def.artifact!.hash, code);
    await storage.saveComponent(def, source);
    invalidate();
    emit({ type: "component.installed", userId: def.origin!.userId, componentId: def.id, title: def.title, runId, scope: def.scope ?? "private" });
  }

  const ctx: BuilderContext = { config, regions, builtins, libraryFor, specOf, regionSpecOf, commitSpec, installComponent };

  // ---------------------------------------------------------------- people

  async function describe(userId: string): Promise<UserDescription> {
    const user = await config.describeUser(userId);
    if (!user) throw new HttpError(403, "unknown user");
    return user;
  }

  /** Context keys from the browser become the server's descriptions; unknown keys fall back to each context's first option. */
  function describeContext(keys: Record<string, string> = {}) {
    return mapValues(config.context ?? {}, (options, name) => {
      const key = keys[name];
      return key !== undefined && Object.hasOwn(options, key) ? options[key]! : Object.values(options)[0]!;
    });
  }

  // ---------------------------------------------------------------- the decider

  async function serve(userId: string, body: ServeRequest, opts: { spec?: Spec | "default" } = {}): Promise<Decision> {
    const region = regions[body.region];
    if (!region) throw new HttpError(400, `unknown region '${body.region}'`);
    const user = await describe(userId);
    const audience = user.audience ?? null;
    const spec = opts.spec === "default" ? defaultSpec : (opts.spec ?? (await specOf(userId, audience)));
    const rs = regionSpecOf(spec, body.region, audience);
    try {
      const decision = await runServe(config.decider, {
        userId,
        specVersion: spec.version,
        region,
        views: rs.views,
        home: rs.home,
        library: await libraryFor(userId),
        profile: spec.profile,
        audience,
        request: String(body.request ?? ""),
        context: describeContext(body.context),
        currentView: body.currentView,
        forceView: body.forceView,
        slot: body.slot,
        prompts,
        thresholds,
      });
      await storage.saveDecision(decision);
      emit({ type: "decider.serve", userId, decision });
      if (decision.gap?.flagged)
        emit({
          type: "gap.flagged",
          userId,
          region: region.name,
          request: decision.request,
          probability: decision.gap.probability,
          kind: decision.gap.kind,
          unmatched: decision.gap.unmatched,
          decisionId: decision.id,
        });
      return decision;
    } catch (e) {
      emit({ type: "error", userId, message: `serve failed: ${(e as Error).message}` });
      throw e;
    }
  }

  /** Whether the shared default already serves this person. */
  async function gate(userId: string, regionName: string): Promise<GateRun> {
    if (!regions[regionName]) throw new HttpError(400, `unknown region '${regionName}'`);
    const user = await describe(userId);
    const result = await runGate(config.decider, {
      domain: config.domain,
      needs: user.needs ?? "",
      signals: user.signals ?? "",
      regionSpec: defaults[regionName]!,
      library: builtins,
      prompts,
      thresholds,
    });
    emit({ type: "decider.gate", userId, region: regionName, ...result });
    return result;
  }

  // ---------------------------------------------------------------- the builder

  const active = new Map<string, string>();
  const activeRun = (userId: string) => active.get(userId) ?? null;

  /** Claims the person's single builder slot and starts the run in the background. Returns its id. */
  function startRun(
    userId: string,
    region: string,
    kind: BuilderRun["kind"],
    plan: { tools: Tool[]; done: () => boolean; system: string; prompt: () => Promise<string> },
    runId: string,
    request?: string,
  ) {
    const builder = config.builder;
    if (!builder) throw new HttpError(501, "no builder is configured");
    if (active.has(userId)) throw new HttpError(409, "a builder run is already in progress for this person");
    active.set(userId, runId);
    const started = Date.now();
    emit({ type: "builder.start", userId, runId, kind, region, model: builder.model ?? "builder", ...(request ? { request } : {}) });

    const tools = plan.tools.map(
      (tool): Tool => ({
        ...tool,
        run: async (input) => {
          const toolUseId = crypto.randomUUID().slice(0, 12);
          emit({ type: "builder.tool", userId, runId, toolUseId, name: tool.name, input: JSON.stringify(input).slice(0, 4000) });
          let result: ToolResult;
          try {
            result = await tool.run(input);
          } catch (e) {
            result = { ok: false, text: `The tool failed on the server: ${(e as Error).message}` };
          }
          emit({ type: "builder.result", userId, runId, toolUseId, ok: result.ok, summary: result.text.slice(0, 1500) });
          return result;
        },
      }),
    );

    void (async () => {
      let outcome: { ok: boolean; costUsd: number; turns: number; error?: string };
      try {
        outcome = await builder.run({
          kind,
          runId,
          system: plan.system,
          prompt: await plan.prompt(),
          tools,
          done: plan.done,
          onText: (text) => emit({ type: "builder.text", userId, runId, text }),
        });
      } catch (e) {
        outcome = { ok: false, costUsd: 0, turns: 0, error: (e as Error).message };
      } finally {
        active.delete(userId);
      }
      const ok = outcome.ok && plan.done();
      emit({
        type: "builder.done",
        userId,
        runId,
        ok,
        costUsd: outcome.costUsd,
        durationMs: Date.now() - started,
        turns: outcome.turns,
        ...(ok ? {} : { error: outcome.error ?? "the builder finished without submitting a valid result" }),
      });
    })();
    return runId;
  }

  async function personalize(userId: string, region: string, force = false): Promise<PersonalizeResponse> {
    if (!config.builder) throw new HttpError(501, "no builder is configured");
    if (active.has(userId)) throw new HttpError(409, "a builder run is already in progress for this person");
    const result = await gate(userId, region);
    const { latencyMs: _l, costUsd: _c, inputTokens: _i, model: _m, ...g } = result;
    if (!g.personalize && !force) return { gate: g, runId: null };
    const user = await describe(userId);
    const runId = crypto.randomUUID().slice(0, 8);
    return { gate: g, runId: startRun(userId, region, "personalize", personalizeRun(ctx, { userId, user, region, runId }), runId) };
  }

  async function extend(userId: string, decisionId: string) {
    const decision = await storage.decision(decisionId);
    if (!decision || decision.userId !== userId) throw new HttpError(404, "no such decision");
    if (!decision.gap?.flagged) throw new HttpError(400, "that decision did not flag a gap");
    const user = await describe(userId);
    const runId = crypto.randomUUID().slice(0, 8);
    const plan = extendRun(ctx, {
      userId,
      user,
      region: decision.region,
      runId,
      request: decision.request,
      gapKind: decision.gap.kind,
      unmatched: decision.gap.unmatched,
    });
    return { runId: startRun(userId, decision.region, "extend", plan, runId, decision.request) };
  }

  // ---------------------------------------------------------------- the client's view

  async function canPromote(userId: string) {
    return Boolean(await config.canPromote?.(userId));
  }

  const verifierProblem = () => verificationProblem(config);

  /** Private components waiting for promotion. */
  async function review(userId: string): Promise<ReviewResponse> {
    if (!(await canPromote(userId))) throw new HttpError(403, "not allowed to review components");
    return { components: (await generated()).filter((d) => d.scope !== "shared" && d.artifact) };
  }

  async function regionFor(userId: string, regionName: string, version?: number): Promise<RegionResponse> {
    const region = regions[regionName];
    if (!region) throw new HttpError(400, `unknown region '${regionName}'`);
    const user = await describe(userId);
    const audience = user.audience ?? null;
    const history = await storage.specHistory(userId);
    let spec: Spec;
    if (version === undefined) spec = await specOf(userId, audience);
    else {
      const found = history.find((s) => s.version === version);
      if (!found) throw new HttpError(404, `no version ${version}`);
      spec = normalizeSpec(found, { library: await libraryFor(userId), regions, audience, defaults }).spec;
    }
    const rs = regionSpecOf(spec, regionName, audience);
    const library = await libraryFor(userId);
    const used = new Set(rs.views.flatMap((v) => v.slots.map((s) => s.component)));
    const components: Record<string, ComponentDef> = {};
    for (const def of Object.values(library))
      if (used.has(def.id) || supports(def, audience)) components[def.id] = serializedBuiltins[def.id] ?? serializeComponent(def);
    return {
      spec,
      region,
      views: rs.views,
      home: rs.home,
      components,
      history: history.map((s) => {
        const last = s.changelog.at(-1);
        return { version: s.version, ...(last ? { summary: last.summary, by: last.by, at: last.at } : {}) };
      }),
      activeRun: activeRun(userId),
      design: { textColors: config.design?.textColors ?? [], safePairs: config.design?.safePairs ?? [] },
      pipeline: {
        decider: config.decider.model ?? null,
        builder: config.builder ? (config.builder.model ?? "builder") : null,
        verifierProblem: verifierProblem(),
        canPromote: await canPromote(userId),
      },
    };
  }

  /** The compiled module for a component the person can use. */
  async function artifact(userId: string, id: string, hash: string) {
    const def = (await libraryFor(userId))[id];
    if (!def || def.source !== "generated") return null;
    return storage.artifact(hash);
  }

  async function reset(userId: string) {
    if (active.has(userId)) throw new HttpError(409, "a builder run is in progress");
    await locked(userId, () => storage.deleteSpecs(userId));
    bus.clear(userId);
  }

  async function promote(userId: string, componentId: string) {
    if (!(await canPromote(userId))) throw new HttpError(403, "not allowed to promote components");
    const def = (await generated()).find((d) => d.id === componentId);
    if (!def) throw new HttpError(404, `no generated component '${componentId}'`);
    if (def.scope === "shared") return { promoted: false, reason: "already shared" };
    const keep = (await config.onPromote?.(def, userId)) === false;
    if (keep) return { promoted: false, reason: "kept private by onPromote" };
    const source = await storage.componentSource(def.id);
    if (source === null) throw new HttpError(500, `the source of '${def.id}' is missing`);
    await storage.saveComponent({ ...def, scope: "shared" }, source);
    invalidate();
    emit({ type: "component.promoted", userId, componentId: def.id, title: def.title });
    if (def.origin && def.origin.userId !== userId)
      emit({ type: "component.promoted", userId: def.origin.userId, componentId: def.id, title: def.title });
    return { promoted: true };
  }

  const api = {
    config,
    basePath,
    regions,
    defaultSpec,
    events: bus,
    activeRun,
    libraryFor,
    specOf,
    serve,
    gate,
    personalize,
    extend,
    regionFor,
    artifact,
    reset,
    review,
    promote,
  };
  return { ...api, fetch: createHandler(api) };
}
