import type { ComponentDef, EventOf, MalleableEvent, RegionSpec, Spec } from "@malleable/core";
import { useEvents, useMalleable, useRegion } from "@malleable/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// The Pipeline panel: what the decider decided, what the builder did, what
// it cost, the spec's history and the component library.

type Run = { start: EventOf<"builder.start">; steps: MalleableEvent[]; done?: EventOf<"builder.done"> };
type Entry = { key: string; node: "event"; event: MalleableEvent } | { key: string; node: "run"; run: Run };

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`);
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);
const easeOut = [0.23, 1, 0.32, 1] as const;
const enter = { duration: 0.25, ease: easeOut };
const indicator = { type: "spring", duration: 0.3, bounce: 0.15 } as const;

export type PanelProps = {
  /** The region whose spec and library the panel shows. */
  region: string;
  /** What to call the two models. Defaults: "Decider" and "Builder". */
  names?: { decider?: string; builder?: string };
  /** Who the panel is for, for the reset button: "Reset Maya". */
  person?: string;
  /** App-specific simulation controls, such as device and phase toggles. */
  controls?: ReactNode;
  showDecisions?: boolean;
  onShowDecisions?: (show: boolean) => void;
  /** Called after the person's spec is reset. */
  onReset?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
};

export function Panel(props: PanelProps) {
  const [tab, setTab] = useState<"activity" | "spec" | "library">("activity");
  const events = useEvents();
  const region = useRegion(props.region);
  const { collapsed = false } = props;
  const names = { decider: props.names?.decider ?? "Decider", builder: props.names?.builder ?? "Builder" };
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  // The toggle button swaps between the header and the rail, so carry focus across.
  useEffect(() => {
    if (toggled.current) toggleRef.current?.focus();
    toggled.current = false;
  }, [collapsed]);
  const toggle = () => {
    toggled.current = true;
    props.onCollapsedChange?.(!collapsed);
  };

  const entries = useMemo(() => {
    const runs = new Map<string, Run>();
    const out: Entry[] = [];
    for (const e of events) {
      if (e.type === "builder.start") {
        const run: Run = { start: e, steps: [] };
        runs.set(e.runId, run);
        out.push({ key: e.id, node: "run", run });
      } else if ((e.type === "builder.text" || e.type === "builder.tool" || e.type === "builder.result" || e.type === "builder.done") && runs.has(e.runId)) {
        const run = runs.get(e.runId)!;
        if (e.type === "builder.done") run.done = e;
        else run.steps.push(e);
      } else out.push({ key: e.id, node: "event", event: e });
    }
    return out.reverse();
  }, [events]);

  const deciderCalls = events.filter((e): e is EventOf<"decider.serve"> | EventOf<"decider.gate"> => e.type === "decider.serve" || e.type === "decider.gate");
  const latency = deciderCalls.map((e) => (e.type === "decider.serve" ? e.decision.latencyMs : e.latencyMs));
  const deciderCost = deciderCalls.reduce((n, e) => n + (e.type === "decider.serve" ? e.decision.costUsd : e.costUsd), 0);
  const done = events.filter((e): e is EventOf<"builder.done"> => e.type === "builder.done");
  const builderCost = done.reduce((n, e) => n + e.costUsd, 0);
  const running = entries.some((e) => e.node === "run" && !e.run.done);
  const pipeline = region.data?.pipeline;

  const reset = async () => {
    await region.reset();
    props.onReset?.();
  };

  if (collapsed)
    return (
      <aside className={`mdt-panel ${props.className ?? ""}`} data-collapsed aria-label="Pipeline">
        <button ref={toggleRef} type="button" className="mdt-rail" aria-expanded={false} aria-label="Show pipeline" onClick={toggle}>
          <span className="mdt-rail-label">Pipeline</span>
          {running && <span className="mdt-live" title={`${names.builder} is working`} />}
        </button>
      </aside>
    );

  return (
    // layoutScroll: timeline entries measure themselves against the panel's own scroll.
    // Reopening from the rail slides the panel in from its edge; on page load it is simply there.
    <motion.aside
      layoutScroll
      className={`mdt-panel ${props.className ?? ""}`}
      aria-label="Pipeline"
      initial={toggled.current ? { opacity: 0, x: 12 } : false}
      animate={{ opacity: 1, x: 0, transition: enter }}
    >
      <header className="mdt-head">
        <h2 className="mdt-title">Pipeline</h2>
        <div className="mdt-head-actions">
          <button type="button" className="mdt-text-button" onClick={reset} disabled={Boolean(region.activeRun)}>
            Reset{props.person ? ` ${props.person}` : ""}
          </button>
          {props.onCollapsedChange && (
            <button ref={toggleRef} type="button" className="mdt-text-button" aria-expanded={true} onClick={toggle}>
              Hide
            </button>
          )}
        </div>
      </header>
      {pipeline && (
        <p className="mdt-meta">
          {names.decider} {pipeline.decider && <span className="mdt-mono">{pipeline.decider}</span>} serves every request from the spec.{" "}
          {pipeline.builder ? (
            <>
              {names.builder} <span className="mdt-mono">{pipeline.builder}</span> writes specs and components.
            </>
          ) : (
            <span data-state="warning">No builder is configured.</span>
          )}
          {pipeline.builder && pipeline.verifierProblem && <span data-state="error"> Generated components cannot be installed: {pipeline.verifierProblem}.</span>}
        </p>
      )}

      {(props.controls || props.onShowDecisions) && (
        <div className="mdt-sim">
          {props.controls}
          {props.onShowDecisions && (
            <label className="mdt-sim-check">
              <input type="checkbox" checked={props.showDecisions ?? false} onChange={(e) => props.onShowDecisions!(e.target.checked)} />
              Show {names.decider}'s decisions on the page
            </label>
          )}
        </div>
      )}

      <table className="mdt-table">
        <caption className="mdt-hidden">Cost and speed by model</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col" className="mdt-num">
              Calls
            </th>
            <th scope="col" className="mdt-num">
              Median time
            </th>
            <th scope="col" className="mdt-num">
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{names.decider}</th>
            <td className="mdt-num">{deciderCalls.length}</td>
            <td className="mdt-num">{deciderCalls.length ? secs(median(latency)) : "–"}</td>
            <td className="mdt-num">{usd(deciderCost)}</td>
          </tr>
          <tr>
            <th scope="row">{names.builder}</th>
            <td className="mdt-num">{done.length}</td>
            <td className="mdt-num">{done.length ? secs(median(done.map((d) => d.durationMs))) : "–"}</td>
            <td className="mdt-num">{usd(builderCost)}</td>
          </tr>
        </tbody>
      </table>

      <nav className="mdt-tabs" aria-label="Pipeline sections">
        {(["activity", "spec", "library"] as const).map((t) => (
          <button key={t} type="button" aria-current={tab === t} onClick={() => setTab(t)}>
            {tab === t && <motion.span layoutId="mdt-tab" className="mdt-tab-underline" transition={indicator} />}
            {t === "activity" ? "Activity" : t === "spec" ? "Spec" : "Library"}
          </button>
        ))}
      </nav>

      <div className="mdt-body">
        {tab === "activity" && (
          <ol className="mdt-timeline">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                // Position only: running cards grow as the builder works, and scaling them would stretch their text.
                <motion.li key={entry.key} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0, transition: enter }}>
                  {entry.node === "run" ? <RunCard run={entry.run} names={names} /> : <EventCard event={entry.event} names={names} />}
                </motion.li>
              ))}
            </AnimatePresence>
            {entries.length === 0 && <li className="mdt-meta">No activity yet. Ask for something, or personalize.</li>}
          </ol>
        )}
        {tab === "spec" && region.data && (
          <SpecTab region={props.region} spec={region.data.spec} history={region.data.history} loadVersion={region.loadVersion} names={names} />
        )}
        {tab === "library" && region.data && (
          <LibraryTab components={region.data.components} views={region.data.views} canPromote={region.data.pipeline.canPromote} names={names} />
        )}
      </div>
    </motion.aside>
  );
}

type Names = { decider: string; builder: string };

function EventCard({ event: e, names }: { event: MalleableEvent; names: Names }) {
  const time = new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  switch (e.type) {
    case "decider.gate":
      return (
        <article className="mdt-entry" data-kind="decider">
          <p className="mdt-entry-head">
            <strong>{names.decider} · gate</strong>
            <span className="mdt-meta">
              {secs(e.latencyMs)} · {usd(e.costUsd)} · {time}
            </span>
          </p>
          <p>
            Default fits: <strong>{Math.round(e.defaultFits * 100)}%</strong>. Specialization {e.specialization.score.toFixed(1)} of{" "}
            {Object.keys(e.specialization.legend).length - 1}: {e.specialization.legend[String(Math.round(e.specialization.score))] ?? ""}.
          </p>
          <p data-state={e.personalize ? "warning" : undefined}>
            {e.personalize ? `Default does not fit. Handing off to ${names.builder}.` : `Default fits. No ${names.builder} call.`}
          </p>
        </article>
      );
    case "decider.serve": {
      const d = e.decision;
      const title = (id: string) => d.viewTitles[id] ?? id;
      const probs = Object.entries(d.viewProbabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
      return (
        <article className="mdt-entry" data-kind="decider">
          <p className="mdt-entry-head">
            <strong>
              {names.decider} · {d.slot ? `served slot ${d.slot}` : "served"}
            </strong>
            <span className="mdt-meta">
              {secs(d.latencyMs)} · {usd(d.costUsd)} · {time}
            </span>
          </p>
          <p>“{d.request}”</p>
          <div className="mdt-probs" role="list" aria-label="View probabilities">
            {probs.map(([id, p]) => (
              <div key={id} role="listitem" className="mdt-prob" data-chosen={id === d.view || undefined}>
                <span>{id === "none-of-these" ? "None of these" : title(id)}</span>
                <span className="mdt-prob-track">
                  <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: p }} transition={{ duration: 0.5, ease: easeOut }} />
                </span>
                <span className="mdt-num">{Math.round(p * 100)}%</span>
              </div>
            ))}
          </div>
          <details>
            <summary className="mdt-meta">
              {d.questionCount} questions in one call · layout {d.layout} · gap {Math.round((d.gap?.probability ?? 0) * 100)}% · spec v{d.specVersion}
            </summary>
            <ul className="mdt-plain mdt-meta">
              {Object.entries(d.props).flatMap(([slot, ps]) =>
                Object.entries(ps).map(([k, v]) => (
                  <li key={`${slot}.${k}`}>
                    {slot}.{k} → <strong>{v}</strong> ({Math.round((d.propConfidence[slot]?.[k] ?? 0) * 100)}%)
                  </li>
                )),
              )}
              {d.invalid.map((i) => (
                <li key={i} data-state="warning">
                  Replaced an invalid answer: {i}
                </li>
              ))}
            </ul>
          </details>
        </article>
      );
    }
    case "gap.flagged":
      return (
        <article className="mdt-entry" data-kind="gap">
          <p className="mdt-entry-head">
            <strong>Gap flagged</strong>
            <span className="mdt-meta">{time}</span>
          </p>
          <p data-state="warning">
            {Math.round(e.probability * 100)}% that no view serves “{e.request}”. Likely missing: {e.kind.replace(/-/g, " ")}
            {e.unmatched.length ? ` (${e.unmatched.map((u) => `${u.component}.${u.prop}`).join(", ")} has no matching option)` : ""}.
          </p>
        </article>
      );
    case "spec.version":
      return (
        <article className="mdt-entry" data-kind="spec">
          <p className="mdt-entry-head">
            <strong>Spec v{e.version}</strong>
            <span className="mdt-meta">
              {e.by} · {time}
            </span>
          </p>
          <p>{e.summary}</p>
        </article>
      );
    case "component.installed":
      return (
        <article className="mdt-entry" data-kind="spec">
          <p className="mdt-entry-head">
            <strong>Component installed</strong>
            <span className="mdt-meta">{time}</span>
          </p>
          <p>
            {e.title} <span className="mdt-mono">{e.componentId}</span>{" "}
            {e.scope === "shared" ? "joined the shared library." : "is installed for this person only, until it is promoted."}
          </p>
        </article>
      );
    case "component.promoted":
      return (
        <article className="mdt-entry" data-kind="spec">
          <p className="mdt-entry-head">
            <strong>Component promoted</strong>
            <span className="mdt-meta">{time}</span>
          </p>
          <p>
            {e.title} <span className="mdt-mono">{e.componentId}</span> joined the shared library. {names.builder} can now use it for everyone.
          </p>
        </article>
      );
    case "error":
      return (
        <article className="mdt-entry" data-kind="error">
          <p data-state="error">{e.message}</p>
        </article>
      );
    default:
      return null;
  }
}

function RunCard({ run, names }: { run: Run; names: Names }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.done]);
  const results = new Map(run.steps.filter((s): s is EventOf<"builder.result"> => s.type === "builder.result").map((r) => [r.toolUseId, r]));
  const elapsed = run.done ? run.done.durationMs : now - Date.parse(run.start.at);

  return (
    <article className="mdt-entry" data-kind="builder">
      <p className="mdt-entry-head">
        <strong>
          {names.builder} · {run.start.kind === "personalize" ? "build personal spec" : "extend spec"}
        </strong>
        <span className="mdt-meta">{run.done ? `${secs(elapsed)} · ${usd(run.done.costUsd)} · ${run.done.turns} turns` : `running ${secs(elapsed)}`}</span>
      </p>
      {run.start.request && <p>“{run.start.request}”</p>}
      <ol className="mdt-steps">
        {run.steps.map((s) => {
          if (s.type === "builder.text")
            return (
              <li key={s.id} className="mdt-step-text">
                {s.text}
              </li>
            );
          if (s.type === "builder.tool") {
            const r = results.get(s.toolUseId);
            return (
              <li key={s.id} data-state={r && !r.ok ? "error" : undefined}>
                <details>
                  <summary>
                    <span className="mdt-mono">{s.name}</span>
                    <span className="mdt-meta">{r ? (r.ok ? " ok" : " returned errors") : " running"}</span>
                  </summary>
                  <pre className="mdt-pre">{pretty(s.input)}</pre>
                  {r && <pre className="mdt-pre">{r.summary}</pre>}
                </details>
              </li>
            );
          }
          return null;
        })}
        {!run.done && <li className="mdt-meta">Working…</li>}
      </ol>
      {run.done && !run.done.ok && <p data-state="error">{run.done.error}</p>}
    </article>
  );
}

function pretty(json: string) {
  try {
    const v = JSON.parse(json);
    if (typeof v?.code === "string") return `${JSON.stringify({ ...v, code: `(${v.code.split("\n").length} lines)` }, null, 2)}\n\n${v.code}`;
    return JSON.stringify(v, null, 2);
  } catch {
    return json;
  }
}

function SpecTab(p: { region: string; spec: Spec; history: { version: number }[]; loadVersion: (v: number) => Promise<Spec>; names: Names }) {
  const [version, setVersion] = useState<number | null>(null);
  const [shown, setShown] = useState<Spec>(p.spec);
  const { loadVersion } = p;
  useEffect(() => {
    if (version === null || version === p.spec.version) setShown(p.spec);
    else void loadVersion(version).then(setShown);
  }, [version, p.spec, loadVersion]);
  const spec = shown;
  const rs: RegionSpec | undefined = spec.regions[p.region];
  return (
    <div className="mdt-stack">
      <p className="mdt-meta">{spec.userId ? `Personal spec for ${spec.userId}, derived from ${spec.parent}.` : "The shared default spec every person starts on."}</p>
      {p.history.length > 1 && (
        <div className="mdt-actions" role="group" aria-label="Spec versions">
          {p.history.map((h) => (
            <button key={h.version} type="button" className="mdt-button" aria-pressed={spec.version === h.version} onClick={() => setVersion(h.version)}>
              v{h.version}
            </button>
          ))}
        </div>
      )}
      <ol className="mdt-plain mdt-changelog">
        {spec.changelog.map((c) => (
          <li key={c.version}>
            <strong>v{c.version}</strong> <span className="mdt-meta">{c.by}</span> {c.summary}
          </li>
        ))}
      </ol>
      <section className="mdt-stack-tight">
        <h3 className="mdt-subtitle">Profile {p.names.decider} reads</h3>
        <p>{spec.profile || <span className="mdt-meta">None.</span>}</p>
      </section>
      {spec.rationale.length > 0 && (
        <section className="mdt-stack-tight">
          <h3 className="mdt-subtitle">Why it looks like this</h3>
          <ul className="mdt-rationale">
            {spec.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="mdt-stack-tight">
        <h3 className="mdt-subtitle">Views</h3>
        {!rs && <p className="mdt-meta">This region uses the shared default.</p>}
        {rs?.views.map((v) => (
          <div key={v.id} className="mdt-spec-view">
            <p>
              <strong>{v.title}</strong>{" "}
              <span className="mdt-meta">
                {v.id === rs.home ? "home · " : ""}
                {v.layout}
                {v.audiences ? ` · for ${v.audiences.join(", ")}` : ""}
              </span>
            </p>
            <p className="mdt-meta">{v.purpose}</p>
            <ul className="mdt-plain mdt-meta">
              {v.slots.map((s) => (
                <li key={s.id}>
                  <span className="mdt-mono">{s.component}</span> in {s.area}
                  {Object.keys(s.props).length > 0 &&
                    ` · fixed ${Object.entries(s.props)
                      .map(([k, x]) => `${k}=${x}`)
                      .join(", ")}`}
                  {s.adaptive.length > 0 && ` · ${p.names.decider} picks ${s.adaptive.join(", ")}`}
                  {s.options &&
                    ` · added options ${Object.entries(s.options)
                      .flatMap(([k, o]) => Object.keys(o).map((x) => `${k}.${x}`))
                      .join(", ")}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <details>
        <summary className="mdt-meta">Raw spec JSON</summary>
        <pre className="mdt-pre">{JSON.stringify(spec, null, 2)}</pre>
      </details>
    </div>
  );
}

function LibraryTab(p: { components: Record<string, ComponentDef>; views: { slots: { component: string }[] }[]; canPromote: boolean; names: Names }) {
  const { client } = useMalleable();
  const [pending, setPending] = useState<ComponentDef[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (p.canPromote)
      client
        .review()
        .then((r) => setPending(r.components))
        .catch((e: Error) => setMessage(e.message));
  }, [client, p.canPromote]);
  useEffect(refresh, [refresh]);

  const used = new Set(p.views.flatMap((v) => v.slots.map((s) => s.component)));
  const defs = Object.values(p.components).sort((a, b) => (a.source === b.source ? a.title.localeCompare(b.title) : a.source === "generated" ? -1 : 1));
  const promote = async (id: string) => {
    setMessage(null);
    try {
      const r = await client.promote(id);
      setMessage(r.promoted ? `Promoted ${id}.` : `Not promoted: ${r.reason ?? "unknown reason"}.`);
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="mdt-stack">
      {p.canPromote && (
        <section className="mdt-stack-tight">
          <h3 className="mdt-subtitle">Waiting for promotion</h3>
          {message && <p className="mdt-meta">{message}</p>}
          {pending.length === 0 && <p className="mdt-meta">No private components.</p>}
          <ul className="mdt-plain mdt-stack">
            {pending.map((d) => (
              <li key={d.id} className="mdt-spec-view">
                <p>
                  <strong>{d.title}</strong> <span className="mdt-mono">{d.id}</span>
                </p>
                <p className="mdt-meta">{d.description}</p>
                {d.origin && (
                  <p className="mdt-meta">
                    Written for {d.origin.userId}: “{d.origin.request}”
                  </p>
                )}
                <div className="mdt-actions">
                  <button type="button" className="mdt-button" onClick={() => promote(d.id)}>
                    Promote to everyone
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="mdt-plain mdt-stack">
        {defs.map((d) => (
          <li key={d.id} className="mdt-spec-view">
            <p>
              <strong>{d.title}</strong>{" "}
              <span className="mdt-meta">
                {d.source === "generated" ? `generated by ${p.names.builder}${d.scope === "shared" ? "" : ", private"}` : "built in"}
                {d.catalog && (
                  <>
                    {" "}
                    · catalog <span className="mdt-mono">{d.catalog}</span>
                  </>
                )}
                {used.has(d.id) ? " · in this spec" : ""}
              </span>
            </p>
            <p className="mdt-meta">{d.description}</p>
            {d.origin && (
              <p className="mdt-meta">
                Created for {d.origin.userId}: “{d.origin.request}”
              </p>
            )}
            <ul className="mdt-plain mdt-meta">
              {Object.entries(d.props).map(([k, prop]) => (
                <li key={k}>
                  {prop.label}: {Object.keys(prop.options).join(" / ")}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
