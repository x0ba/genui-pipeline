import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { fmtPct, heat, plural, risk, useSelection, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Person = { id: string; name: string; gpa: number };
type Bin = { lo: number; hi: number; label: string; people: Person[]; t: number };

const CX = 110;
const CY = 110;
const R = 100;
const R0 = 58;

const EDGES: Record<string, number[]> = {
  whole: [0, 1, 2, 3, 4],
  half: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
  two: [0, 2, 4],
  "cut-2-5": [0, 2.5, 4],
  "cut-3": [0, 3, 4],
  "cut-3-5": [0, 3.5, 4],
};

function pt(a: number, r: number) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function fmtG(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function slicePath(a0: number, a1: number, donut: boolean) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(a0, R);
  const [x1, y1] = pt(a1, R);
  if (!donut) return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
  const [ix1, iy1] = pt(a1, R0);
  const [ix0, iy0] = pt(a0, R0);
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${R0} ${R0} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

function fullPath(donut: boolean) {
  const outer = `M ${CX - R} ${CY} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`;
  if (!donut) return outer;
  return `${outer} M ${CX - R0} ${CY} a ${R0} ${R0} 0 1 0 ${2 * R0} 0 a ${R0} ${R0} 0 1 0 ${-2 * R0} 0 Z`;
}

export default function AdviseeGpaDistribution({ props }: Props) {
  const subject = useSubject();
  const { selectStudent } = useSelection();
  const mark = props.markType ?? "pie";
  const binKey = props.bins && EDGES[props.bins] ? props.bins : "whole";
  const scope = props.scope ?? "all";
  const [picked, setPicked] = useState<number | null>(null);

  const advisees = subject.kind === "advisor" ? subject.advisees : [];

  const { bins, total, below2 } = useMemo(() => {
    const people: Person[] = advisees
      .filter((s) => scope !== "flagged" || risk(s).flags.length > 0)
      .filter((s) => typeof s.gpa === "number" && !Number.isNaN(s.gpa))
      .map((s) => ({ id: s.id, name: s.name, gpa: s.gpa }));
    const edges = EDGES[binKey];
    const n = edges.length - 1;
    const out: Bin[] = [];
    for (let i = 0; i < n; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      const last = i === n - 1;
      const inBin = people
        .filter((p) => {
          const g = Math.max(0, Math.min(4, p.gpa));
          return g >= lo && (last ? g <= hi : g < hi);
        })
        .sort((a, b) => a.gpa - b.gpa);
      out.push({ lo, hi, label: `${fmtG(lo)}–${fmtG(hi)}`, people: inBin, t: 0.2 + (0.8 * i) / Math.max(1, n - 1) });
    }
    const b2 = people.filter((p) => p.gpa < 2).length;
    return { bins: out, total: people.length, below2: b2 };
  }, [advisees, scope, binKey]);

  if (subject.kind !== "advisor") {
    return <p className="vbg-meta">GPA distribution is available to advisors.</p>;
  }

  const sel = picked !== null && picked < bins.length ? bins[picked] : null;
  const maxCount = Math.max(1, ...bins.map((b) => b.people.length));
  const biggest = bins.reduce((a, b) => (b.people.length > a.people.length ? b : a), bins[0]);
  const who = scope === "flagged" ? "flagged advisees" : "advisees";

  let acc = 0;
  const arcs = bins.map((b, i) => {
    const frac = total ? b.people.length / total : 0;
    const a0 = -Math.PI / 2 + acc * 2 * Math.PI;
    acc += frac;
    const a1 = -Math.PI / 2 + acc * 2 * Math.PI;
    return { i, b, frac, a0, a1 };
  });

  const toggle = (i: number) => setPicked((p) => (p === i ? null : i));

  const legend = (
    <ul className="vbg-custom-plain vbg-custom-stack-2" aria-label="GPA ranges" style={{ minWidth: 200, flex: "1 1 200px" }}>
      {bins.map((b, i) => {
        const h = heat(b.t);
        return (
          <motion.li layout key={b.label} style={{ display: "flex", alignItems: "center", gap: "var(--vbg-space-2)" }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, flex: "0 0 12px", background: h.fill, border: "1px solid var(--vbg-border-default)", borderRadius: "var(--vbg-radius-small)" }} />
            <button type="button" className="vbg-custom-text-button" aria-pressed={picked === i} onClick={() => toggle(i)}>
              GPA {b.label}
            </button>
            <span className="vbg-numeric" style={{ marginLeft: "auto" }}>
              {b.people.length}
              <span className="vbg-meta"> {total ? fmtPct(b.people.length / total) : "0%"}</span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );

  let chart: JSX.Element;
  if (mark === "bars") {
    chart = (
      <ol className="vbg-bar-list" tabIndex={0} aria-label={`Number of ${who} in each GPA range`} style={{ flex: "1 1 100%" }}>
        {bins.map((b, i) => (
          <motion.li layout key={b.label} className="vbg-bar" data-role={picked === i ? "primary" : undefined}>
            <button type="button" className="vbg-bar-label vbg-custom-text-button" aria-pressed={picked === i} onClick={() => toggle(i)}>
              GPA {b.label}
            </button>
            <span className="vbg-bar-value vbg-numeric">
              {b.people.length}
              <span className="vbg-meta"> {total ? fmtPct(b.people.length / total) : "0%"}</span>
            </span>
            <span className="vbg-bar-track">
              <motion.span className="vbg-bar-fill" initial={false} animate={{ width: `${(b.people.length / maxCount) * 100}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
            </span>
          </motion.li>
        ))}
      </ol>
    );
  } else {
    const donut = mark === "donut";
    const nonEmpty = arcs.filter((a) => a.frac > 0);
    chart = (
      <>
        <svg viewBox="0 0 220 220" width="100%" style={{ maxWidth: 240, flex: "0 1 240px" }} role="img" aria-label={`${donut ? "Donut" : "Pie"} chart of ${plural(total, "advisee")} by GPA range: ${bins.map((b) => `${b.label}: ${b.people.length}`).join(", ")}`}>
          {total === 0 ? (
            <path d={fullPath(donut)} fill={heat(0).fill} stroke="var(--vbg-border-default)" fillRule="evenodd" />
          ) : (
            nonEmpty.map((a) => {
              const h = heat(a.b.t);
              const full = a.frac >= 0.9999;
              const mid = (a.a0 + a.a1) / 2;
              const lr = donut ? (R + R0) / 2 : R * 0.62;
              const [lx, ly] = full ? (donut ? pt(-Math.PI / 2, lr) : [CX, CY]) : pt(mid, lr);
              const showLabel = a.a1 - a.a0 > 0.45;
              return (
                <g key={a.b.label} onClick={() => toggle(a.i)} style={{ cursor: "pointer" }}>
                  <path
                    d={full ? fullPath(donut) : slicePath(a.a0, a.a1, donut)}
                    fill={h.fill}
                    fillRule="evenodd"
                    stroke={picked === a.i ? "var(--vbg-text-primary)" : "var(--vbg-surface-primary)"}
                    strokeWidth={picked === a.i ? 2.5 : 1.5}
                  />
                  {showLabel && (
                    <text x={lx} y={ly + 4} textAnchor="middle" className="vbg-meta" style={{ fill: h.ink }}>
                      {a.b.people.length}
                    </text>
                  )}
                </g>
              );
            })
          )}
          {donut && (
            <>
              <text x={CX} y={CY - 2} textAnchor="middle" className="vbg-meta" style={{ fill: "var(--vbg-text-primary)" }}>
                {total}
              </text>
              <text x={CX} y={CY + 14} textAnchor="middle" className="vbg-meta">
                {scope === "flagged" ? "flagged" : "advisees"}
              </text>
            </>
          )}
        </svg>
        {legend}
      </>
    );
  }

  return (
    <figure className="vbg-chart vbg-custom-stack-4">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--vbg-space-6)" }}>{chart}</div>
      <figcaption className="vbg-caption">
        {total === 0
          ? `No ${who} with a GPA on record.`
          : `${plural(total, scope === "flagged" ? "flagged advisee" : "advisee")} by cumulative GPA. Most fall in ${biggest.label} (${biggest.people.length}); ${below2} ${below2 === 1 ? "is" : "are"} below 2.0. Select a range to list its advisees.`}
      </figcaption>
      {sel && (
        <motion.div layout className="vbg-custom-stack-2">
          <p className="vbg-heading-16">
            GPA {sel.label}: {plural(sel.people.length, "advisee")}
          </p>
          {sel.people.length === 0 ? (
            <p className="vbg-meta">Nobody in this range.</p>
          ) : (
            <ul className="vbg-custom-plain vbg-custom-stack-2">
              {sel.people.map((p) => (
                <li key={p.id} style={{ display: "flex", gap: "var(--vbg-space-2)", alignItems: "baseline" }}>
                  <button type="button" className="vbg-custom-text-button" onClick={() => selectStudent(p.id)}>
                    {p.name}
                  </button>
                  <span className="vbg-meta vbg-numeric">{p.gpa.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
    </figure>
  );
}
