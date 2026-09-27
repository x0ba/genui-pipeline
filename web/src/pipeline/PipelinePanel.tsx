import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineEvent } from "../../../shared/events";
import type { Persona } from "../../../shared/personas";
import type { ServeContext, Spec } from "../../../shared/spec";
import type { Bootstrap, SpecState } from "../api";
import { Segmented } from "../Segmented";

const DEVICES = [
  { id: "desktop", label: "Desktop" },
  { id: "phone", label: "Phone" },
] as const satisfies readonly { id: ServeContext["device"]; label: string }[];

const PHASES = [
  { id: "planning", label: "Planning" },
  { id: "registration-open", label: "Open" },
  { id: "add-drop", label: "Add/drop" },
] as const satisfies readonly { id: ServeContext["phase"]; label: string }[];

type Ev<T extends PipelineEvent["type"]> = Extract<PipelineEvent, { type: T }>;
type Run = { start: Ev<"claude.start">; steps: PipelineEvent[]; done?: Ev<"claude.done"> };
type Entry = { at: string; key: string; node: "event"; event: PipelineEvent } | { at: string; key: string; node: "run"; run: Run };

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`);
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

export function PipelinePanel(props: {
  events: PipelineEvent[];
  boot: Bootstrap;
  persona: Persona;
  specState: SpecState | null;
  context: ServeContext;
  onContext: (patch: Partial<ServeContext>) => void;
  showDecisions: boolean;
  onShowDecisions: (show: boolean) => void;
  onReset: () => void;
  loadVersion: (v: number) => Promise<Spec>;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const [tab, setTab] = useState<"activity" | "spec" | "library">("activity");
  const { events, collapsed } = props;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  // The toggle button swaps between the header and the rail, so carry focus across.
  useEffect(() => {
    if (toggled.current) toggleRef.current?.focus();
    toggled.current = false;
  }, [collapsed]);
  const toggle = () => {
    toggled.current = true;
    props.onCollapsedChange(!collapsed);
  };

  const entries = useMemo(() => {
    const runs = new Map<string, Run>();
    const out: Entry[] = [];
    for (const e of events) {
      if (e.type === "claude.start") {
        const run: Run = { start: e, steps: [] };
        runs.set(e.runId, run);
        out.push({ at: e.at, key: e.id, node: "run", run });
      } else if ("runId" in e && e.runId && runs.has(e.runId) && e.type !== "component.installed" && e.type !== "spec.version") {
        const run = runs.get(e.runId)!;
        if (e.type === "claude.done") run.done = e;
        else run.steps.push(e);
      } else out.push({ at: e.at, key: e.id, node: "event", event: e });
    }
    return out.reverse();
  }, [events]);

  const jevCalls = events.filter((e): e is Ev<"jev.serve"> | Ev<"jev.gate"> => e.type === "jev.serve" || e.type === "jev.gate");
  const jevLatency = jevCalls.map((e) => (e.type === "jev.serve" ? e.decision.latencyMs : e.latencyMs));
  const jevCost = jevCalls.reduce((n, e) => n + (e.type === "jev.serve" ? e.decision.costUsd : e.costUsd), 0);
  const done = events.filter((e): e is Ev<"claude.done"> => e.type === "claude.done");
  const claudeCost = done.reduce((n, e) => n + e.costUsd, 0);
  const running = entries.some((e) => e.node === "run" && !e.run.done);

  if (collapsed)
    return (
      <aside className="vbg-custom-panel" data-collapsed aria-label="Pipeline">
        <button ref={toggleRef} type="button" className="vbg-custom-panel-rail" aria-expanded={false} aria-label="Show pipeline" onClick={toggle}>
          <span className="vbg-custom-panel-rail-label">Pipeline</span>
          {running && <span className="vbg-custom-panel-live" title="Claude is working" />}
        </button>
      </aside>
    );

  return (
    <aside className="vbg-custom-panel" aria-label="Pipeline">
      <header className="vbg-custom-panel-head">
        <h2 className="vbg-heading-20">Pipeline</h2>
        <div className="vbg-custom-panel-head-actions">
          <button type="button" className="vbg-custom-text-button" onClick={props.onReset}>
            Reset {props.persona.short}
          </button>
          <button ref={toggleRef} type="button" className="vbg-custom-text-button" aria-expanded={true} onClick={toggle}>
            Hide
          </button>
        </div>
      </header>
      <p className="vbg-meta">
        Jev <span className="vbg-mono">{props.boot.config.jevModel}</span> serves every request from the spec. Claude{" "}
        <span className="vbg-mono">{props.boot.config.claudeModel}</span> writes specs and components.
        {!props.boot.config.hasTypesafeKey && <span data-state="error"> TYPESAFE_API_KEY is not set on the server.</span>}
      </p>

      <div className="vbg-custom-sim">
        <span className="vbg-meta" aria-hidden="true">Device</span>
        <Segmented label="Device" size="compact" options={DEVICES} value={props.context.device} onChange={(device) => props.onContext({ device })} />
        <span className="vbg-meta" aria-hidden="true">Registration</span>
        <Segmented label="Registration" size="compact" options={PHASES} value={props.context.phase} onChange={(phase) => props.onContext({ phase })} />
        <label className="vbg-custom-sim-check">
          <input type="checkbox" checked={props.showDecisions} onChange={(e) => props.onShowDecisions(e.target.checked)} />
          Show Jev's decisions on the page
        </label>
      </div>

      <div className="vbg-table-wrap">
        <table className="vbg-custom-compact-table">
          <caption className="vbg-visually-hidden">Cost and speed by model for {props.persona.name}</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" className="vbg-numeric">Calls</th>
              <th scope="col" className="vbg-numeric">Median time</th>
              <th scope="col" className="vbg-numeric">Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Jev</th>
              <td className="vbg-numeric">{jevCalls.length}</td>
              <td className="vbg-numeric">{jevCalls.length ? secs(median(jevLatency)) : "–"}</td>
              <td className="vbg-numeric">{usd(jevCost)}</td>
            </tr>
            <tr>
              <th scope="row">Claude</th>
              <td className="vbg-numeric">{done.length}</td>
              <td className="vbg-numeric">{done.length ? secs(median(done.map((d) => d.durationMs))) : "–"}</td>
              <td className="vbg-numeric">{usd(claudeCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav className="vbg-custom-tabs vbg-custom-panel-tabs" aria-label="Pipeline sections">
        {(["activity", "spec", "library"] as const).map((t) => (
          <button key={t} type="button" aria-current={tab === t} onClick={() => setTab(t)}>
            {tab === t && <motion.span layoutId="panel-tab" className="vbg-custom-tab-underline" />}
            {t === "activity" ? "Activity" : t === "spec" ? "Spec" : "Library"}
          </button>
        ))}
      </nav>

      <div className="vbg-custom-panel-body">
        {tab === "activity" && (
          <ol className="vbg-custom-timeline">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <motion.li key={entry.key} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                  {entry.node === "run" ? <RunCard run={entry.run} /> : <EventCard event={entry.event} />}
                </motion.li>
              ))}
            </AnimatePresence>
            {entries.length === 0 && <li className="vbg-meta">No activity yet. Ask for something, or personalize.</li>}
          </ol>
        )}
        {tab === "spec" && props.specState && <SpecTab specState={props.specState} loadVersion={props.loadVersion} />}
        {tab === "library" && props.specState && <LibraryTab specState={props.specState} />}
      </div>
    </aside>
  );
}

function EventCard({ event: e }: { event: PipelineEvent }) {
  const time = new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  switch (e.type) {
    case "jev.gate":
      return (
        <article className="vbg-custom-entry" data-kind="jev">
          <p className="vbg-custom-entry-head">
            <strong>Jev · 80/20 gate</strong>
            <span className="vbg-meta">
              {secs(e.latencyMs)} · {usd(e.costUsd)} · {time}
            </span>
          </p>
          <p>
            Default fits: <strong>{Math.round(e.defaultFits * 100)}%</strong>. Specialization {e.specialization.score.toFixed(1)} of 3:{" "}
            {e.specialization.legend[String(Math.round(e.specialization.score))] ?? ""}.
          </p>
          <p data-state={e.personalize ? "warning" : undefined}>{e.personalize ? "Default does not fit. Handing off to Claude." : "Default fits. No Claude call."}</p>
        </article>
      );
    case "jev.serve": {
      const d = e.decision;
      const title = (id: string) => d.viewTitles?.[id] ?? id;
      const probs = Object.entries(d.viewProbabilities).sort((a, b) => b[1] - a[1]).slice(0, 4);
      return (
        <article className="vbg-custom-entry" data-kind="jev">
          <p className="vbg-custom-entry-head">
            <strong>Jev · served</strong>
            <span className="vbg-meta">
              {secs(d.latencyMs)} · {usd(d.costUsd)} · {time}
            </span>
          </p>
          <p>“{d.request}”</p>
          <div className="vbg-custom-probs" role="list" aria-label="View probabilities">
            {probs.map(([id, p]) => (
              <div key={id} role="listitem" className="vbg-custom-prob" data-chosen={id === d.view || undefined}>
                <span>{id === "none-of-these" ? "None of these" : title(id)}</span>
                <span className="vbg-custom-prob-track">
                  <motion.span initial={{ width: 0 }} animate={{ width: `${p * 100}%` }} />
                </span>
                <span className="vbg-numeric">{Math.round(p * 100)}%</span>
              </div>
            ))}
          </div>
          <details>
            <summary className="vbg-meta">
              {d.questionCount} questions in one call · layout {d.layout} · gap {Math.round((d.gap?.probability ?? 0) * 100)}% · spec v{d.specVersion}
            </summary>
            <ul className="vbg-custom-plain vbg-meta">
              {Object.entries(d.props).flatMap(([slot, ps]) =>
                Object.entries(ps).map(([k, v]) => (
                  <li key={`${slot}.${k}`}>
                    {slot}.{k} → <strong>{v}</strong> ({Math.round((d.propConfidence[slot]?.[k] ?? 0) * 100)}%)
                  </li>
                )),
              )}
            </ul>
          </details>
        </article>
      );
    }
    case "gap.flagged":
      return (
        <article className="vbg-custom-entry" data-kind="gap">
          <p className="vbg-custom-entry-head">
            <strong>Gap flagged</strong>
            <span className="vbg-meta">{time}</span>
          </p>
          <p data-state="warning">
            {Math.round(e.probability * 100)}% that no view serves “{e.request}”. Likely missing: {e.kind.replace(/-/g, " ")}
            {e.unmatched?.length ? ` (${e.unmatched.map((u) => `${u.component}.${u.prop}`).join(", ")} has no matching option)` : ""}.
          </p>
        </article>
      );
    case "spec.version":
      return (
        <article className="vbg-custom-entry" data-kind="spec">
          <p className="vbg-custom-entry-head">
            <strong>Spec v{e.version}</strong>
            <span className="vbg-meta">
              {e.by} · {time}
            </span>
          </p>
          <p>{e.summary}</p>
        </article>
      );
    case "component.installed":
      return (
        <article className="vbg-custom-entry" data-kind="spec">
          <p className="vbg-custom-entry-head">
            <strong>Component installed</strong>
            <span className="vbg-meta">{time}</span>
          </p>
          <p>
            {e.title} <span className="vbg-mono">{e.componentId}</span> joined the shared library. Jev can now serve it, and future specs can reuse it.
          </p>
        </article>
      );
    case "jev.error":
      return (
        <article className="vbg-custom-entry" data-kind="error">
          <p data-state="error">{e.message}</p>
        </article>
      );
    default:
      return null;
  }
}

function RunCard({ run }: { run: Run }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (run.done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.done]);
  const results = new Map(run.steps.filter((s): s is Ev<"claude.result"> => s.type === "claude.result").map((r) => [r.toolUseId, r]));
  const elapsed = run.done ? run.done.durationMs : now - Date.parse(run.start.at);

  return (
    <article className="vbg-custom-entry" data-kind="claude">
      <p className="vbg-custom-entry-head">
        <strong>Claude · {run.start.kind === "personalize" ? "build personal spec" : "extend spec"}</strong>
        <span className="vbg-meta">
          {run.done ? `${secs(elapsed)} · ${usd(run.done.costUsd)} · ${run.done.turns} turns` : `running ${secs(elapsed)}`}
        </span>
      </p>
      {run.start.request && <p>“{run.start.request}”</p>}
      <ol className="vbg-custom-steps">
        {run.steps.map((s) => {
          if (s.type === "claude.text") return <li key={s.id} className="vbg-custom-step-text">{s.text}</li>;
          if (s.type === "claude.tool") {
            const r = results.get(s.toolUseId);
            return (
              <li key={s.id} data-state={r && !r.ok ? "error" : undefined}>
                <details>
                  <summary>
                    <span className="vbg-mono">{s.name}</span>
                    <span className="vbg-meta">{r ? (r.ok ? " ok" : " returned errors") : " running"}</span>
                  </summary>
                  <pre className="vbg-custom-pre">{pretty(s.input)}</pre>
                  {r && <pre className="vbg-custom-pre">{r.summary}</pre>}
                </details>
              </li>
            );
          }
          return null;
        })}
        {!run.done && <li className="vbg-meta">Working…</li>}
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

function SpecTab({ specState, loadVersion }: { specState: SpecState; loadVersion: (v: number) => Promise<Spec> }) {
  const [version, setVersion] = useState<number | null>(null);
  const [shown, setShown] = useState<Spec>(specState.spec);
  useEffect(() => {
    if (version === null || version === specState.spec.version) setShown(specState.spec);
    else void loadVersion(version).then(setShown);
  }, [version, specState, loadVersion]);
  const spec = shown;
  return (
    <div className="vbg-custom-stack-4">
      <p className="vbg-meta">
        {spec.userId ? `Personal spec for ${spec.userId}, derived from ${spec.parent}.` : "The shared default spec every person starts on."}
      </p>
      {specState.history.length > 1 && (
        <div className="vbg-custom-actions" role="group" aria-label="Spec versions">
          {specState.history.map((h) => (
            <button key={h.version} type="button" className="vbg-button" aria-pressed={spec.version === h.version} onClick={() => setVersion(h.version)}>
              v{h.version}
            </button>
          ))}
        </div>
      )}
      <ol className="vbg-custom-plain vbg-custom-changelog">
        {spec.changelog.map((c) => (
          <li key={c.version}>
            <strong>v{c.version}</strong> <span className="vbg-meta">{c.by}</span> {c.summary}
          </li>
        ))}
      </ol>
      <section className="vbg-custom-stack-2">
        <h3 className="vbg-heading-16">Profile Jev reads</h3>
        <p>{spec.profile}</p>
      </section>
      {spec.rationale.length > 0 && (
        <section className="vbg-custom-stack-2">
          <h3 className="vbg-heading-16">Why it looks like this</h3>
          <ul className="vbg-custom-rationale">
            {spec.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="vbg-custom-stack-2">
        <h3 className="vbg-heading-16">Views</h3>
        {spec.views.map((v) => (
          <div key={v.id} className="vbg-custom-spec-view">
            <p>
              <strong>{v.title}</strong> <span className="vbg-meta">{v.id === spec.home ? "home · " : ""}{v.layout}</span>
            </p>
            <p className="vbg-meta">{v.purpose}</p>
            <ul className="vbg-custom-plain vbg-meta">
              {v.slots.map((s) => (
                <li key={s.id}>
                  <span className="vbg-mono">{s.component}</span> in {s.region}
                  {Object.keys(s.props).length > 0 && ` · fixed ${Object.entries(s.props).map(([k, x]) => `${k}=${x}`).join(", ")}`}
                  {s.adaptive.length > 0 && ` · Jev picks ${s.adaptive.join(", ")}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <details>
        <summary className="vbg-meta">Raw spec JSON</summary>
        <pre className="vbg-custom-pre">{JSON.stringify(spec, null, 2)}</pre>
      </details>
    </div>
  );
}

function LibraryTab({ specState }: { specState: SpecState }) {
  const used = new Set(specState.spec.views.flatMap((v) => v.slots.map((s) => s.component)));
  const defs = Object.values(specState.library).sort((a, b) => (a.source === b.source ? a.title.localeCompare(b.title) : a.source === "generated" ? -1 : 1));
  return (
    <ul className="vbg-custom-plain vbg-custom-stack-4">
      {defs.map((d) => (
        <li key={d.id} className="vbg-custom-spec-view">
          <p>
            <strong>{d.title}</strong>{" "}
            <span className="vbg-meta">
              {d.source === "generated" ? "generated by Claude" : "built in"} · atlas <span className="vbg-mono">{d.atlas}</span>
              {used.has(d.id) ? " · in this spec" : ""}
            </span>
          </p>
          <p className="vbg-meta">{d.description}</p>
          {d.origin && <p className="vbg-meta">Created for {d.origin.userId}: “{d.origin.request}”</p>}
          <ul className="vbg-custom-plain vbg-meta">
            {Object.entries(d.props).map(([k, p]) => (
              <li key={k}>
                {p.label}: {Object.keys(p.options).join(" / ")}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
