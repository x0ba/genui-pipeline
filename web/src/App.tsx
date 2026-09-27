import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PipelineEvent } from "../../shared/events";
import { viewsFor, type Decision, type ServeContext, type Spec, type Unmatched } from "../../shared/spec";
import { api, useEvents, type Bootstrap, type SpecState } from "./api";
import { collapse, enter, exit, indicator, KitProvider, move, useAppState } from "./kit";
import { PipelinePanel } from "./pipeline/PipelinePanel";
import { Renderer } from "./runtime/Renderer";
import { Segmented } from "./Segmented";

type Gap = { request: string; kind: string; probability: number; unmatched: Unmatched[] };

function slotKeys(spec: Spec) {
  return new Map(spec.views.flatMap((v) => v.slots.map((s) => [`${v.id}/${s.id}`, s.component] as const)));
}

export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [userId, setUserId] = useState("maya");
  const [specState, setSpecState] = useState<SpecState | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [context, setContext] = useState<ServeContext>({ device: "desktop", phase: "planning" });
  const [request, setRequest] = useState("");
  const [lastRequest, setLastRequest] = useState("");
  // What started the in-flight serve; only "ask" (the prompt bar) drives the Ask button.
  const [serving, setServing] = useState<"ask" | "other" | null>(null);
  // The tab being opened, so the underline answers the click before Jev does.
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  const [gateNote, setGateNote] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [showDecisions, setShowDecisions] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(() => localStorage.getItem("pipeline-panel") === "collapsed");
  const [resetAt, setResetAt] = useState<Record<string, string>>({});
  const allEvents = useEvents();
  const seq = useRef(0);
  const mountedAt = useRef(new Date().toISOString());
  const handled = useRef(new Set<string>());

  const persona = boot?.personas.find((p) => p.id === userId);
  const events = useMemo(
    () => allEvents.filter((e) => e.userId === userId && (!resetAt[userId] || e.at > resetAt[userId])),
    [allEvents, userId, resetAt],
  );
  const runs = useMemo(() => {
    const started = events.filter((e): e is Extract<PipelineEvent, { type: "claude.start" }> => e.type === "claude.start");
    const done = new Set(events.filter((e) => e.type === "claude.done").map((e) => (e as { runId: string }).runId));
    return { active: started.find((s) => !done.has(s.runId)) ?? null, started };
  }, [events]);

  useEffect(() => {
    api.bootstrap().then(setBoot).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    localStorage.setItem("pipeline-panel", panelCollapsed ? "collapsed" : "open");
  }, [panelCollapsed]);

  const serve = useCallback(
    async (text: string, opts: { forceView?: string; ctx?: ServeContext; spec?: SpecState; ask?: boolean } = {}) => {
      const s = opts.spec ?? specState;
      if (!s) return;
      const mine = ++seq.current;
      setServing(opts.ask ? "ask" : "other");
      setOpening(opts.forceView ?? null);
      setError(null);
      try {
        const d = await api.serve(userId, { request: text, context: opts.ctx ?? context, currentView: viewId ?? undefined, forceView: opts.forceView });
        if (mine !== seq.current) return;
        setDecision(d);
        setViewId(d.view);
        if (!opts.forceView) setLastRequest(text);
        setGap(d.gap?.flagged ? { request: d.request, kind: d.gap.kind, probability: d.gap.probability, unmatched: d.gap.unmatched ?? [] } : null);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(`Jev could not serve this request: ${(e as Error).message}`);
        // Without a decision, show the spec's own home view with its default props.
        setViewId((v) => opts.forceView ?? v ?? s.spec.home);
      } finally {
        if (mine === seq.current) {
          setServing(null);
          setOpening(null);
        }
      }
    },
    [specState, userId, context, viewId],
  );

  const loadSpec = useCallback(
    async (then: string | null) => {
      const prev = specState?.spec;
      const next = await api.spec(userId);
      setSpecState(next);
      if (prev && prev.userId === next.spec.userId && prev.version !== next.spec.version) {
        const before = slotKeys(prev);
        const added = [...slotKeys(next.spec)].filter(([k, c]) => before.get(k) !== c).map(([k]) => k);
        setFresh(new Set(added));
        setTimeout(() => setFresh(new Set()), 4000);
      } else if (prev && prev.userId !== next.spec.userId) {
        setFresh(new Set([...slotKeys(next.spec).keys()]));
        setTimeout(() => setFresh(new Set()), 4000);
      }
      if (then !== null) await serve(then, { spec: next });
      return next;
    },
    [userId, specState, serve],
  );

  // Switching person: load their spec and let Jev serve the opening screen.
  useEffect(() => {
    let cancelled = false;
    setSpecState(null);
    setDecision(null);
    setViewId(null);
    setGap(null);
    setGateNote(null);
    setLastRequest("");
    api.spec(userId).then((s) => {
      if (cancelled) return;
      setSpecState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (specState && !decision && !serving) void serve("", { spec: specState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specState]);

  // When a Claude run for this person finishes, pick up the new spec and re-serve.
  useEffect(() => {
    for (const e of events) {
      if (e.type !== "claude.done" || handled.current.has(e.id) || e.at < mountedAt.current) continue;
      handled.current.add(e.id);
      const start = runs.started.find((s) => s.runId === e.runId);
      if (!e.ok) {
        setError(`Claude run ${e.runId} ended without a valid result: ${e.error ?? "unknown error"}`);
        continue;
      }
      void loadSpec(start?.kind === "extend" ? (start.request ?? lastRequest) : lastRequest);
    }
  }, [events, runs.started, loadSpec, lastRequest]);

  const onAsk = (e: FormEvent) => {
    e.preventDefault();
    void serve(request, { ask: true });
  };

  const personalize = async (force = false) => {
    setGateNote(null);
    try {
      const r = await api.personalize(userId, force);
      if (!r.runId)
        setGateNote(
          `Jev kept the shared default: it judged a ${Math.round(r.gate.defaultFits * 100)}% chance the default already serves ${persona?.short}.`,
        );
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const extend = async () => {
    if (!gap) return;
    try {
      await api.extend(userId, gap.request, gap.kind, gap.unmatched);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const reset = async () => {
    await api.reset(userId);
    setResetAt((r) => ({ ...r, [userId]: new Date().toISOString() }));
    setDecision(null);
    setGap(null);
    setGateNote(null);
    const s = await api.spec(userId);
    setSpecState(s);
  };

  const setCtx = (patch: Partial<ServeContext>) => {
    const ctx = { ...context, ...patch };
    setContext(ctx);
    void serve(lastRequest, { ctx, forceView: lastRequest ? undefined : viewId ?? undefined });
  };

  if (!boot || !persona) return <p className="vbg-custom-boot">{error ?? "Loading…"}</p>;
  const spec = specState?.spec;
  const personal = Boolean(spec?.userId);
  const views = spec ? viewsFor(spec, persona.subject.kind) : [];
  const activeKind = runs.active?.kind;

  return (
    <MotionConfig reducedMotion="user" transition={move}>
      <div className="vbg-custom-app" data-panel={panelCollapsed ? "collapsed" : "open"}>
        <div className="vbg-custom-main">
          <header className="vbg-custom-masthead">
            <h1 className="vbg-title">Course planner</h1>
            <div className="vbg-custom-persona">
              <Segmented
                label="Person"
                options={boot.personas.map((p) => ({ id: p.id, label: p.name }))}
                value={userId}
                onChange={setUserId}
              />
              <p className="vbg-meta">{persona.role}</p>
            </div>
          </header>

          <AnimatePresence initial={false}>
            {spec && (!personal || activeKind === "personalize") && (
              <motion.div key="personalize" className="vbg-custom-reveal" {...collapse}>
                <div className="vbg-custom-callout">
                  {activeKind === "personalize" ? (
                    <p aria-live="polite">
                      <strong>Claude is designing {persona.short}'s spec</strong> from their needs, usage and the Pattern Atlas. Follow along in the pipeline panel.
                    </p>
                  ) : (
                    <>
                      <p>
                        {persona.short} is on the <strong>shared default spec</strong>. Jev first checks whether the default already fits; only if it doesn't does Claude build a personal spec.
                      </p>
                      <div className="vbg-custom-actions">
                        <button type="button" className="vbg-button" onClick={() => personalize()} disabled={Boolean(runs.active)}>
                          Personalize
                        </button>
                        {gateNote && (
                          <button type="button" className="vbg-custom-text-button" onClick={() => personalize(true)}>
                            Personalize anyway
                          </button>
                        )}
                      </div>
                      {gateNote && <p className="vbg-meta">{gateNote}</p>}
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="vbg-custom-device" data-device={context.device}>
            <div className="vbg-custom-ask-group">
              <form className="vbg-custom-ask" onSubmit={onAsk}>
                <label className="vbg-visually-hidden" htmlFor="ask">
                  Ask for what you need
                </label>
                <input
                  id="ask"
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder={`Ask for what you need, ${persona.short}`}
                  autoComplete="off"
                />
                <button type="submit" className="vbg-button" disabled={serving === "ask"}>
                  {serving === "ask" ? "Serving…" : "Ask"}
                </button>
              </form>
              <div className="vbg-custom-suggestions" role="group" aria-label="Suggestions">
                {persona.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="vbg-custom-chip"
                    onClick={() => {
                      setRequest(s);
                      void serve(s, { ask: true });
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {gap && (
                <motion.div key="gap" className="vbg-custom-reveal" {...collapse}>
                  <div className="vbg-custom-gap" role="status">
                    {activeKind === "extend" ? (
                      <p aria-live="polite">
                        <strong>Claude is extending the spec</strong> for “{gap.request}”. The new view drops in when it passes validation.
                      </p>
                    ) : (
                      <>
                        <p>
                          <strong>Not in this interface yet.</strong> Jev flagged “{gap.request}” as outside the spec ({Math.round(gap.probability * 100)}%,{" "}
                          {gap.kind.replace(/-/g, " ")}).{" "}
                          {gap.unmatched.length
                            ? `No option for ${gap.unmatched.map((u) => u.label.toLowerCase()).join(" or ")} matches it; showing the closest one instead.`
                            : "Showing the closest view instead."}
                        </p>
                        <div className="vbg-custom-actions">
                          <button type="button" className="vbg-button" onClick={extend} disabled={Boolean(runs.active)}>
                            Build it with Claude
                          </button>
                          <button type="button" className="vbg-custom-text-button" onClick={() => setGap(null)}>
                            Dismiss
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <p className="vbg-custom-error" data-state="error" role="alert">
                {error}
              </p>
            )}

            {spec && specState && (
              <>
                <nav className="vbg-custom-tabs" aria-label="Views">
                  {views.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-current={v.id === viewId}
                      onClick={() => serve(`Open the "${v.title}" view`, { forceView: v.id })}
                    >
                      {v.id === (opening ?? viewId) && <motion.span layoutId="tab-underline" className="vbg-custom-tab-underline" transition={indicator} />}
                      {v.title}
                    </button>
                  ))}
                </nav>
                <KitProvider key={userId} subject={persona.subject}>
                  <div className="vbg-custom-stage" aria-busy={serving !== null}>
                    {viewId ? (
                      <Renderer
                        spec={spec}
                        library={specState.library}
                        viewId={viewId}
                        decision={decision}
                        showDecisions={showDecisions}
                        fresh={fresh}
                      />
                    ) : (
                      <p className="vbg-meta vbg-custom-pending">Jev is choosing the first screen…</p>
                    )}
                  </div>
                  <Notices />
                </KitProvider>
              </>
            )}
          </div>
        </div>

        <PipelinePanel
          events={events}
          boot={boot}
          persona={persona}
          specState={specState}
          context={context}
          onContext={setCtx}
          showDecisions={showDecisions}
          onShowDecisions={setShowDecisions}
          onReset={reset}
          loadVersion={(v) => api.specVersion(userId, v)}
          collapsed={panelCollapsed}
          onCollapsedChange={setPanelCollapsed}
        />
      </div>
    </MotionConfig>
  );
}

function Notices() {
  const notices = useAppState((s) => s.notices);
  return (
    <div className="vbg-custom-notices" aria-live="polite">
      {/* popLayout lets the rest of the stack close the gap while a notice fades. */}
      <AnimatePresence mode="popLayout">
        {notices.map((n) => (
          <motion.p
            key={n.id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: enter }}
            exit={{ opacity: 0, scale: 0.96, transition: exit }}
          >
            {n.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
