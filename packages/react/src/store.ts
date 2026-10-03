import type { Decision, MalleableEvent, PersonalizeResponse, RegionResponse, Spec, Unmatched, View } from "@malleable/core";
import type { MalleableClient } from "./client";

// One region's state: its spec, the current view and the latest decision. It
// lives outside React so `Region`, `useRegion` and devtools share one copy.

export type Gap = { decisionId: string; request: string; kind: string; probability: number; unmatched: Unmatched[] };
export type ActiveRun = { runId: string; kind: "personalize" | "extend" | null; region: string | null; request?: string };

export type RegionSnapshot = {
  name: string;
  data: RegionResponse | null;
  /** The view on screen: the decided one, or the region's home until the first decision arrives. */
  view: View | null;
  decision: Decision | null;
  gap: Gap | null;
  /** What started the serve in flight: the ask bar, or something else such as a tab. */
  serving: "ask" | "other" | null;
  /** The view being opened, so navigation can answer before the decider does. */
  opening: string | null;
  error: string | null;
  lastRequest: string;
  /** `viewId/slotId` keys of slots that are new since the previous spec version. */
  fresh: ReadonlySet<string>;
  /** The person's builder run in progress, whichever region it is for. */
  activeRun: ActiveRun | null;
};

const FRESH_MS = 4000;

function slotKeys(views: View[]) {
  return new Map(views.flatMap((v) => v.slots.map((s) => [`${v.id}/${s.id}`, s.component] as const)));
}

export function createRegionStore(name: string, deps: { client: MalleableClient; context: () => Record<string, string> }) {
  let state: RegionSnapshot = {
    name,
    data: null,
    view: null,
    decision: null,
    gap: null,
    serving: null,
    opening: null,
    error: null,
    lastRequest: "",
    fresh: new Set(),
    activeRun: null,
  };
  const listeners = new Set<() => void>();
  let started = false;
  let seq = 0;
  let freshTimer: ReturnType<typeof setTimeout> | undefined;

  const set = (patch: Partial<RegionSnapshot>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  const viewById = (id: string | null | undefined, data = state.data) =>
    data ? (data.views.find((v) => v.id === id) ?? data.views.find((v) => v.id === data.home) ?? data.views[0] ?? null) : null;

  type ServeOpts = { forceView?: string; slot?: string; ask?: boolean };
  async function serve(text: string, opts: ServeOpts = {}) {
    if (!state.data) return;
    const mine = ++seq;
    set({ serving: opts.ask ? "ask" : "other", opening: opts.forceView ?? null, error: null });
    try {
      const d = await deps.client.serve({
        region: name,
        request: text,
        context: deps.context(),
        ...(state.view ? { currentView: state.view.id } : {}),
        ...(opts.forceView ? { forceView: opts.forceView } : {}),
        ...(opts.slot ? { slot: opts.slot } : {}),
      });
      if (mine !== seq) return;
      set({
        decision: d,
        view: viewById(d.view),
        ...(opts.forceView || opts.slot ? {} : { lastRequest: text }),
        gap: d.gap?.flagged ? { decisionId: d.id, request: d.request, kind: d.gap.kind, probability: d.gap.probability, unmatched: d.gap.unmatched } : null,
      });
    } catch (e) {
      if (mine !== seq) return;
      // Without a decision, keep showing a view the spec has, with its default props.
      set({ error: `The interface could not be served: ${(e as Error).message}`, view: viewById(opts.forceView ?? state.view?.id) });
    } finally {
      if (mine === seq) set({ serving: null, opening: null });
    }
  }

  async function load(then: string | null) {
    const prev = state.data;
    let data: RegionResponse;
    try {
      data = await deps.client.spec(name);
    } catch (e) {
      set({ error: `Could not load this part of the page: ${(e as Error).message}` });
      return;
    }
    let fresh: Set<string> = new Set();
    if (prev && prev.spec.userId === data.spec.userId && prev.spec.version !== data.spec.version) {
      const before = slotKeys(prev.views);
      fresh = new Set([...slotKeys(data.views)].filter(([k, c]) => before.get(k) !== c).map(([k]) => k));
    } else if (prev && prev.spec.userId !== data.spec.userId) fresh = new Set(slotKeys(data.views).keys());
    clearTimeout(freshTimer);
    if (fresh.size) freshTimer = setTimeout(() => set({ fresh: new Set() }), FRESH_MS);
    const activeRun = data.activeRun ? (state.activeRun?.runId === data.activeRun ? state.activeRun : { runId: data.activeRun, kind: null, region: null }) : null;
    set({ data, view: viewById(state.view?.id, data), fresh, activeRun });
    if (then !== null) await serve(then);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!started) {
        started = true;
        void load("");
      }
      return () => void listeners.delete(listener);
    },
    /** Serve a request typed by the person. */
    request: (text: string, opts: { ask?: boolean } = {}) => serve(text, { ask: opts.ask ?? true }),
    /** Navigate to a view; the decider still picks its props and layout. */
    open(viewId: string) {
      const v = state.data?.views.find((x) => x.id === viewId);
      return serve(`Open the "${v?.title ?? viewId}" view`, { forceView: viewId });
    },
    /** A request about one slot of the current view: only its props are decided. */
    requestChange: (slotId: string, text: string) => serve(text, { slot: slotId }),
    /** Hand the current gap to the builder. */
    async build() {
      if (!state.gap) throw new Error("there is no gap to build");
      const { runId } = await deps.client.extend(state.gap.decisionId);
      set({ activeRun: { runId, kind: "extend", region: name, request: state.gap.request } });
      return runId;
    },
    async personalize(force = false): Promise<PersonalizeResponse> {
      const r = await deps.client.personalize(name, force);
      if (r.runId) set({ activeRun: { runId: r.runId, kind: "personalize", region: name } });
      return r;
    },
    async reset() {
      await deps.client.reset();
      set({ decision: null, gap: null, lastRequest: "", activeRun: null });
      await load("");
    },
    loadVersion: (version: number): Promise<Spec> => deps.client.spec(name, version).then((r) => r.spec),
    dismissGap: () => set({ gap: null }),
    dismissError: () => set({ error: null }),
    /** Context changed: serve the last request again in the new context. */
    contextChanged() {
      if (!state.data) return;
      void serve(state.lastRequest, state.lastRequest ? {} : state.view ? { forceView: state.view.id } : {});
    },
    /** Events from the person's stream. Replayed events update run state but trigger nothing. */
    onEvent(e: MalleableEvent, replay: boolean) {
      if (e.type === "builder.start") set({ activeRun: { runId: e.runId, kind: e.kind, region: e.region, ...(e.request ? { request: e.request } : {}) } });
      else if (e.type === "builder.done") {
        const run = state.activeRun?.runId === e.runId ? state.activeRun : null;
        if (state.activeRun?.runId === e.runId) set({ activeRun: null });
        if (replay || !started) return;
        if (run?.region && run.region !== name) return;
        if (!e.ok) {
          if (run?.region === name) set({ error: `The builder run ended without a valid result: ${e.error ?? "unknown error"}` });
          return;
        }
        void load(run?.kind === "extend" ? (run.request ?? state.lastRequest) : state.lastRequest);
      } else if (e.type === "component.promoted" && !replay && started) void load(null);
    },
  };
}

export type RegionStore = ReturnType<typeof createRegionStore>;
