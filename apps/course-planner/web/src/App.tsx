import { Panel } from "@malleable/devtools";
import { MalleableProvider, Region, useRegion } from "@malleable/react";
import * as motionReact from "motion/react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import type { Persona } from "../../shared/personas";
import { api, type Bootstrap } from "./api";
import { components } from "./components";
import { frames, ShowDecisions } from "./frames";
import * as kit from "./kit";
import { collapse, enter, exit, indicator, KitProvider, move, useAppState } from "./kit";
import { Segmented } from "./Segmented";

const REGION = "dashboard";
const modules = { "@kit": kit, "motion/react": motionReact };

type Context = { device: "desktop" | "phone"; registration_phase: "planning" | "registration-open" | "add-drop" };

const DEVICES = [
  { id: "desktop", label: "Desktop" },
  { id: "phone", label: "Phone" },
] as const;

const PHASES = [
  { id: "planning", label: "Planning" },
  { id: "registration-open", label: "Open" },
  { id: "add-drop", label: "Add/drop" },
] as const;

export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<Context>({ device: "desktop", registration_phase: "planning" });
  const [showDecisions, setShowDecisions] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(() => localStorage.getItem("pipeline-panel") === "collapsed");

  useEffect(() => {
    api
      .bootstrap()
      .then(async (b) => {
        setBoot(b);
        setUserId(b.userId ?? (await api.session(b.personas[0]!.id)).userId);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    localStorage.setItem("pipeline-panel", panelCollapsed ? "collapsed" : "open");
  }, [panelCollapsed]);

  const switchTo = (id: string) => {
    api
      .session(id)
      .then(() => setUserId(id))
      .catch((e) => setError(e.message));
  };

  const persona = boot?.personas.find((p) => p.id === userId);
  if (!boot || !persona) return <p className="vbg-custom-boot">{error ?? "Loading…"}</p>;

  return (
    <MotionConfig reducedMotion="user" transition={move}>
      {/* One provider per person: the session cookie changed, so the event stream must reconnect. */}
      <MalleableProvider key={persona.id} components={components} modules={modules} context={context}>
        <KitProvider subject={persona.subject}>
          <ShowDecisions.Provider value={showDecisions}>
            <div className="vbg-custom-app" data-panel={panelCollapsed ? "collapsed" : "open"}>
              <div className="vbg-custom-main">
                <header className="vbg-custom-masthead">
                  <h1 className="vbg-title">Course planner</h1>
                  <div className="vbg-custom-persona">
                    <Segmented label="Person" options={boot.personas.map((p) => ({ id: p.id, label: p.name }))} value={persona.id} onChange={switchTo} />
                    <p className="vbg-meta">{persona.role}</p>
                  </div>
                </header>
                <Planner persona={persona} device={context.device} />
              </div>

              <Panel
                region={REGION}
                names={{ decider: "Jev", builder: "Claude" }}
                person={persona.short}
                controls={
                  <>
                    <span aria-hidden="true">Device</span>
                    <Segmented label="Device" size="compact" options={DEVICES} value={context.device} onChange={(device) => setContext((c) => ({ ...c, device }))} />
                    <span aria-hidden="true">Registration</span>
                    <Segmented
                      label="Registration"
                      size="compact"
                      options={PHASES}
                      value={context.registration_phase}
                      onChange={(registration_phase) => setContext((c) => ({ ...c, registration_phase }))}
                    />
                    {!boot.config.hasTypesafeKey && <p data-state="error">TYPESAFE_API_KEY is not set on the server.</p>}
                  </>
                }
                showDecisions={showDecisions}
                onShowDecisions={setShowDecisions}
                collapsed={panelCollapsed}
                onCollapsedChange={setPanelCollapsed}
              />
            </div>
          </ShowDecisions.Provider>
        </KitProvider>
      </MalleableProvider>
    </MotionConfig>
  );
}

function Planner({ persona, device }: { persona: Persona; device: Context["device"] }) {
  const region = useRegion(REGION);
  const [request, setRequest] = useState("");
  const [gateNote, setGateNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const spec = region.data?.spec;
  const personal = Boolean(spec?.userId);
  const activeKind = region.activeRun?.kind;
  const error = actionError ?? region.error;

  useEffect(() => {
    if (personal) setGateNote(null);
  }, [personal]);

  const run = (fn: () => Promise<unknown>) => {
    setActionError(null);
    fn().catch((e) => setActionError((e as Error).message));
  };

  const personalize = (force = false) =>
    run(async () => {
      setGateNote(null);
      const r = await region.personalize(force);
      if (!r.runId)
        setGateNote(`Jev kept the shared default: it judged a ${Math.round(r.gate.defaultFits * 100)}% chance the default already serves ${persona.short}.`);
    });

  const ask = (text: string) => {
    setActionError(null);
    void region.request(text);
  };

  const onAsk = (e: FormEvent) => {
    e.preventDefault();
    ask(request);
  };

  return (
    <>
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
                    {persona.short} is on the <strong>shared default spec</strong>. Jev first checks whether the default already fits; only if it doesn't does Claude build a
                    personal spec.
                  </p>
                  <div className="vbg-custom-actions">
                    <button type="button" className="vbg-button" onClick={() => personalize()} disabled={Boolean(region.activeRun)}>
                      Personalize
                    </button>
                    {gateNote && (
                      <motion.button
                        type="button"
                        className="vbg-custom-text-button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: enter }}
                        onClick={() => personalize(true)}
                      >
                        Personalize anyway
                      </motion.button>
                    )}
                  </div>
                  {/* Jev's verdict lands a beat after the click; open it in place so the view below does not jump. */}
                  <AnimatePresence initial={false}>
                    {gateNote && (
                      <motion.div key="gate-note" className="vbg-custom-reveal" {...collapse}>
                        <p className="vbg-meta">{gateNote}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="vbg-custom-device" data-device={device}>
        <div className="vbg-custom-ask-group">
          <form className="vbg-custom-ask" onSubmit={onAsk}>
            <label className="vbg-visually-hidden" htmlFor="ask">
              Ask for what you need
            </label>
            <input id="ask" value={request} onChange={(e) => setRequest(e.target.value)} placeholder={`Ask for what you need, ${persona.short}`} autoComplete="off" />
            <button type="submit" className="vbg-button" disabled={region.serving === "ask"}>
              {region.serving === "ask" ? "Serving…" : "Ask"}
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
                  ask(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {region.gap && (
            <motion.div key="gap" className="vbg-custom-reveal" {...collapse}>
              <div className="vbg-custom-gap" role="status">
                {activeKind === "extend" ? (
                  <p aria-live="polite">
                    <strong>Claude is extending the spec</strong> for “{region.gap.request}”. The new view drops in when it passes validation.
                  </p>
                ) : (
                  <>
                    <p>
                      <strong>Not in this interface yet.</strong> Jev flagged “{region.gap.request}” as outside the spec ({Math.round(region.gap.probability * 100)}%,{" "}
                      {region.gap.kind.replace(/-/g, " ")}).{" "}
                      {region.gap.unmatched.length
                        ? `No option for ${region.gap.unmatched.map((u) => u.label.toLowerCase()).join(" or ")} matches it; showing the closest one instead.`
                        : "Showing the closest view instead."}
                    </p>
                    <div className="vbg-custom-actions">
                      <button type="button" className="vbg-button" onClick={() => run(region.build)} disabled={Boolean(region.activeRun)}>
                        Build it with Claude
                      </button>
                      <button type="button" className="vbg-custom-text-button" onClick={region.dismissGap}>
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {error && (
            <motion.div key="error" className="vbg-custom-reveal" {...collapse}>
              <p className="vbg-custom-error" data-state="error" role="alert">
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {region.data && (
          <>
            <nav className="vbg-custom-tabs" aria-label="Views">
              {region.data.views.map((v) => (
                <button key={v.id} type="button" aria-current={v.id === region.view?.id} onClick={() => void region.open(v.id)}>
                  {v.id === (region.opening ?? region.view?.id) && <motion.span layoutId="tab-underline" className="vbg-custom-tab-underline" transition={indicator} />}
                  {v.title}
                </button>
              ))}
            </nav>
            <div className="vbg-custom-stage" aria-busy={region.serving !== null}>
              <Region name={REGION} frames={frames} unstyled className="vbg-custom-view" />
            </div>
            <Notices />
          </>
        )}
      </div>
    </>
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
