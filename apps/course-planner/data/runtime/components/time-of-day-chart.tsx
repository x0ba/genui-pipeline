import { motion } from "motion/react";
import { useMemo } from "react";
import { courseByCode, fmtPct, plural, requirementStatus, sections, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Period = "morning" | "afternoon" | "evening";

const PERIODS: { key: Period; label: string; range: string; color: string }[] = [
  { key: "morning", label: "Morning", range: "before noon", color: "var(--vbg-chart-1)" },
  { key: "afternoon", label: "Afternoon", range: "noon to 5pm", color: "var(--vbg-chart-2)" },
  { key: "evening", label: "Evening", range: "5pm or later", color: "var(--vbg-chart-3)" },
];

function periodOf(start: number): Period {
  if (start < 720) return "morning";
  if (start < 1020) return "afternoon";
  return "evening";
}

const W = 360;
const H = 250;
const CX = W / 2;
const CY = H / 2;
const R = 82;
const RI = 50;

function pt(r: number, a: number) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function slicePath(a0: number, a1: number, inner: number) {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  if (full) {
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

export default function TimeOfDayChart({ props }: Props) {
  const subject = useSubject();
  const markType = props.markType ?? "pie";
  const count = props.count ?? "courses";
  const scope = props.scope ?? "all";
  const student = subject.kind === "student" ? subject.student : null;

  const { rows, total, unscheduled, unit } = useMemo(() => {
    const remaining = new Set<string>();
    if (student) for (const r of requirementStatus(student)) for (const c of r.remaining) remaining.add(c);
    const sets: Record<Period, Set<string>> = { morning: new Set(), afternoon: new Set(), evening: new Set() };
    const secCounts: Record<Period, number> = { morning: 0, afternoon: 0, evening: 0 };
    let unscheduled = 0;
    const allCourses = new Set<string>();
    for (const s of sections) {
      const c = courseByCode.get(s.course);
      if (scope === "cs" && (!c || c.dept !== "CS")) continue;
      if (scope === "remaining" && !remaining.has(s.course)) continue;
      if (scope === "open" && s.enrolled >= s.capacity) continue;
      if (!s.meeting || !s.meeting.days || s.meeting.days.length === 0) {
        unscheduled++;
        continue;
      }
      const p = periodOf(s.meeting.start);
      sets[p].add(s.course);
      secCounts[p]++;
      allCourses.add(s.course);
    }
    const rows = PERIODS.map((p) => ({ ...p, value: count === "sections" ? secCounts[p.key] : sets[p.key].size }));
    const total = rows.reduce((n, r) => n + r.value, 0);
    return { rows, total, unscheduled, unit: count === "sections" ? "section" : "course", distinct: allCourses.size };
  }, [student, scope, count]);

  const top = [...rows].sort((a, b) => b.value - a.value)[0];
  const scopeText =
    scope === "cs" ? "computer science " : scope === "remaining" ? "remaining-requirement " : scope === "open" ? "open " : "";

  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });

  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const barW = 200;

  return (
    <figure className="vbg-chart">
      {total === 0 ? (
        <p className="vbg-meta">No {scopeText}{unit}s meet at a set time this term.</p>
      ) : markType === "bars" ? (
        <svg viewBox={`0 0 ${W} 130`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`Number of ${scopeText}${unit}s starting in the morning, afternoon and evening`}>
          {rows.map((r, i) => {
            const y = 14 + i * 38;
            const w = (r.value / maxVal) * barW;
            return (
              <g key={r.key}>
                <text x={0} y={y + 14} fill="currentColor" className="vbg-meta">{r.label}</text>
                <motion.rect x={80} y={y} height={20} rx={2} fill={r.color} initial={false} animate={{ width: Math.max(w, r.value ? 2 : 0) }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
                <text x={80 + w + 6} y={y + 14} fill="currentColor" className="vbg-meta">
                  {r.value} · {fmtPct(r.value / total)}
                </text>
              </g>
            );
          })}
          <line x1={80} x2={80} y1={6} y2={124} stroke="var(--vbg-border-default)" />
        </svg>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`${markType === "donut" ? "Donut" : "Pie"} chart of ${scopeText}${unit}s by time of day`}>
          {slices.map((s) =>
            s.value > 0 ? (
              <motion.path key={s.key} d={slicePath(s.a0, s.a1, markType === "donut" ? RI : 0)} fill={s.color} fillRule="evenodd" stroke="var(--vbg-surface-primary)" strokeWidth={2} initial={false} animate={{ d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0) }} />
            ) : null,
          )}
          {slices.map((s) => {
            if (s.value === 0) return null;
            const mid = (s.a0 + s.a1) / 2;
            const [lx, ly] = pt(R + 14, mid);
            const anchor = Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end";
            const dy = ly < CY - R * 0.6 ? -14 : 0;
            return (
              <text key={s.key} x={lx} y={ly + dy} textAnchor={anchor} fill="currentColor" className="vbg-meta">
                <tspan x={lx}>{s.label}</tspan>
                <tspan x={lx} dy={14}>{s.value} · {fmtPct(s.frac)}</tspan>
              </text>
            );
          })}
          {markType === "donut" && (
            <text x={CX} y={CY} textAnchor="middle" fill="currentColor" className="vbg-meta">
              <tspan x={CX} dy={-2}>{total}</tspan>
              <tspan x={CX} dy={14}>{unit}s</tspan>
            </text>
          )}
        </svg>
      )}
      {total > 0 && (
        <div className="vbg-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col" className="vbg-numeric">{unit === "course" ? "Courses" : "Sections"}</th>
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
        {total > 0 ? `${top.label} has the most ${scopeText}${unit}s: ${top.value} of ${total} (${fmtPct(top.value / total)}). ` : ""}
        {count === "courses"
          ? "Periods go by section start time; a course with sections at several times counts in each of those periods."
          : "Each section counts once, by its start time."}
        {unscheduled > 0 ? ` ${plural(unscheduled, "section")} without a set meeting time ${unscheduled === 1 ? "is" : "are"} left out.` : ""}
      </figcaption>
    </figure>
  );
}
