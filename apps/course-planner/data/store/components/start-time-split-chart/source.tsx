import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { courseByCode, fmtPct, plural, requirementStatus, sectionById, sections, useSubject } from "@kit";

type Props = Record<string, string>;
type Bin = { key: string; label: string; range: string; lo: number; hi: number };

const INF = 24 * 60 + 1;
const SPLITS: Record<string, Bin[]> = {
  "am-pm": [
    { key: "am", label: "AM", range: "before noon", lo: 0, hi: 720 },
    { key: "pm", label: "PM", range: "noon or later", lo: 720, hi: INF },
  ],
  "three-periods": [
    { key: "morning", label: "Morning", range: "before noon", lo: 0, hi: 720 },
    { key: "afternoon", label: "Afternoon", range: "noon to 5 PM", lo: 720, hi: 1020 },
    { key: "evening", label: "Evening", range: "5 PM or later", lo: 1020, hi: INF },
  ],
  "four-ranges": [
    { key: "early", label: "Before 10 AM", range: "start before 10 AM", lo: 0, hi: 600 },
    { key: "late-morning", label: "10 AM–noon", range: "start 10 AM to noon", lo: 600, hi: 720 },
    { key: "early-afternoon", label: "Noon–3 PM", range: "start noon to 3 PM", lo: 720, hi: 900 },
    { key: "late", label: "3 PM or later", range: "start 3 PM or later", lo: 900, hi: INF },
  ],
  "cutoff-10am": [
    { key: "before", label: "Before 10 AM", range: "start before 10 AM", lo: 0, hi: 600 },
    { key: "after", label: "10 AM or later", range: "start 10 AM or later", lo: 600, hi: INF },
  ],
  "cutoff-2pm": [
    { key: "before", label: "Before 2 PM", range: "start before 2 PM", lo: 0, hi: 840 },
    { key: "after", label: "2 PM or later", range: "start 2 PM or later", lo: 840, hi: INF },
  ],
  "cutoff-5pm": [
    { key: "before", label: "Before 5 PM", range: "start before 5 PM", lo: 0, hi: 1020 },
    { key: "after", label: "5 PM or later", range: "start 5 PM or later", lo: 1020, hi: INF },
  ],
};
const COLORS = ["var(--vbg-chart-1)", "var(--vbg-chart-2)", "var(--vbg-chart-3)", "var(--vbg-chart-4)"];
const MARKS: { key: string; label: string }[] = [
  { key: "pie", label: "Pie" },
  { key: "donut", label: "Donut" },
  { key: "bars", label: "Bars" },
];

const W = 360;
const PH = 190;
const CX = 90;
const CY = PH / 2;
const R = 78;
const RI = 46;

function pt(r: number, a: number) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function slicePath(a0: number, a1: number, inner: number) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const outer = `M ${CX - R} ${CY} A ${R} ${R} 0 1 1 ${CX + R} ${CY} A ${R} ${R} 0 1 1 ${CX - R} ${CY} Z`;
    if (!inner) return outer;
    return `${outer} M ${CX - inner} ${CY} A ${inner} ${inner} 0 1 0 ${CX + inner} ${CY} A ${inner} ${inner} 0 1 0 ${CX - inner} ${CY} Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(R, a0);
  const [x1, y1] = pt(R, a1);
  if (!inner) return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
  const [ix1, iy1] = pt(inner, a1);
  const [ix0, iy0] = pt(inner, a0);
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

export default function StartTimeSplitChart(props: Props) {
  const subject = useSubject();
  const student = subject.kind === "student" ? subject.student : null;
  const splitKey = SPLITS[props.split] ? props.split : "am-pm";
  const scope = props.scope ?? "all";
  const initialMark = MARKS.some((m) => m.key === props.markType) ? props.markType : "pie";
  const [mark, setMark] = useState(initialMark);
  useEffect(() => setMark(initialMark), [initialMark]);

  const bins = SPLITS[splitKey];

  const { rows, total, unscheduled } = useMemo(() => {
    const remaining = new Set<string>();
    if (student) for (const r of requirementStatus(student)) for (const c of r.remaining) remaining.add(c);
    let pool = sections;
    if (scope === "planned") {
      pool = student ? (student.planned.map((id) => sectionById.get(id)).filter(Boolean) as typeof sections) : [];
    }
    const counts = bins.map(() => 0);
    let unscheduled = 0;
    for (const s of pool) {
      const c = courseByCode.get(s.course);
      if (scope === "cs" && (!c || c.dept !== "CS")) continue;
      if (scope === "remaining" && !remaining.has(s.course)) continue;
      if (scope === "open" && s.enrolled >= s.capacity) continue;
      if (!s.meeting || !s.meeting.days || s.meeting.days.length === 0) {
        unscheduled++;
        continue;
      }
      const i = bins.findIndex((b) => s.meeting.start >= b.lo && s.meeting.start < b.hi);
      if (i >= 0) counts[i]++;
    }
    const rows = bins.map((b, i) => ({ ...b, value: counts[i], color: COLORS[i % COLORS.length] }));
    return { rows, total: counts.reduce((a, b) => a + b, 0), unscheduled };
  }, [student, scope, bins]);

  const scopeText =
    scope === "planned" ? "planned " : scope === "cs" ? "computer science " : scope === "remaining" ? "remaining-requirement " : scope === "open" ? "open " : "";
  const top = [...rows].sort((a, b) => b.value - a.value)[0];

  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });
  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const barX = 110;
  const barW = 170;
  const barsH = 16 + rows.length * 38;
  const keyTop = CY - (rows.length * 40) / 2;

  return (
    <figure className="vbg-chart">
      <div className="vbg-custom-actions" role="group" aria-label="Chart type">
        {MARKS.map((m) => (
          <button
            key={m.key}
            type="button"
            className="vbg-custom-text-button"
            aria-pressed={mark === m.key}
            onClick={() => setMark(m.key)}
            style={{ textDecoration: mark === m.key ? "underline" : "none", textUnderlineOffset: 4 }}
          >
            {m.label}
          </button>
        ))}
      </div>
      {total === 0 ? (
        <p className="vbg-meta">No {scopeText}sections meet at a set time this term.</p>
      ) : mark === "bars" ? (
        <svg viewBox={`0 0 ${W} ${barsH}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`Bar chart of ${scopeText}sections by start time: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}>
          {rows.map((r, i) => {
            const y = 10 + i * 38;
            const w = (r.value / maxVal) * barW;
            return (
              <g key={r.key}>
                <text x={0} y={y + 14} className="vbg-meta">{r.label}</text>
                <motion.rect x={barX} y={y} height={20} rx={2} fill={r.color} initial={false} animate={{ width: Math.max(w, r.value ? 2 : 0) }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
                <text x={barX + w + 6} y={y + 14} className="vbg-meta">
                  {r.value} · {fmtPct(r.value / total)}
                </text>
              </g>
            );
          })}
          <line x1={barX} x2={barX} y1={4} y2={barsH - 4} stroke="var(--vbg-border-default)" />
        </svg>
      ) : (
        <svg viewBox={`0 0 ${W} ${PH}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`${mark === "donut" ? "Donut" : "Pie"} chart of ${scopeText}sections by start time: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}>
          {slices.map((s) =>
            s.value > 0 ? (
              <motion.path key={s.key} d={slicePath(s.a0, s.a1, mark === "donut" ? RI : 0)} fill={s.color} fillRule="evenodd" stroke="var(--vbg-surface-primary)" strokeWidth={2} initial={false} animate={{ d: slicePath(s.a0, s.a1, mark === "donut" ? RI : 0) }} />
            ) : null,
          )}
          {mark === "donut" && (
            <text x={CX} y={CY} textAnchor="middle" className="vbg-meta">
              <tspan x={CX} dy={-2}>{total}</tspan>
              <tspan x={CX} dy={14}>sections</tspan>
            </text>
          )}
          {rows.map((r, i) => {
            const y = keyTop + i * 40;
            return (
              <g key={r.key}>
                <rect x={196} y={y + 4} width={12} height={12} rx={2} fill={r.color} />
                <text x={216} y={y + 14} className="vbg-meta">{r.label}</text>
                <text x={216} y={y + 30} className="vbg-meta">{r.value} · {fmtPct(r.value / total)}</text>
              </g>
            );
          })}
        </svg>
      )}
      {total > 0 && (
        <div className="vbg-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Start time</th>
                <th scope="col" className="vbg-numeric">Sections</th>
                <th scope="col" className="vbg-numeric">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.label} <span className="vbg-meta">{r.range}</span>
                  </th>
                  <td className="vbg-numeric">{r.value}</td>
                  <td className="vbg-numeric">{fmtPct(r.value / total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <figcaption className="vbg-caption">
        {total > 0 ? `${top.label} has the most ${scopeText}sections: ${top.value} of ${total} (${fmtPct(top.value / total)}). ` : ""}
        Each section counts once, by its start time.
        {unscheduled > 0 ? ` ${plural(unscheduled, "section")} without a set meeting time ${unscheduled === 1 ? "is" : "are"} left out.` : ""}
      </figcaption>
    </figure>
  );
}
