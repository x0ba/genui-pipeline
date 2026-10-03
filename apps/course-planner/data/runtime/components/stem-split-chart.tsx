import { motion } from "motion/react";
import { useMemo } from "react";
import { courseByCode, courses, fmtPct, plural, sectionById, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Group = "stem" | "non";

const STEM_DEPTS = new Set([
  "CS", "CSE", "CIS", "COMP", "DATA", "DS", "INFO", "MATH", "STAT", "STATS", "PHYS", "CHEM", "BIO", "BIOL", "BIOS",
  "ENGR", "ENG", "ECE", "EE", "ME", "CE", "BME", "CHE", "ASTR", "GEOL", "GEO", "EES", "ENVS", "NEUR", "NEURO",
]);

const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: "stem", label: "STEM", color: "var(--vbg-chart-1)" },
  { key: "non", label: "Non-STEM", color: "var(--vbg-chart-2)" },
];

function deptOf(code: string): string {
  const c = courseByCode.get(code);
  if (c && c.dept) return String(c.dept);
  return code.split(" ")[0] ?? code;
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

export default function StemSplitChart({ props }: Props) {
  const subject = useSubject();
  const markType = props.markType ?? "pie";
  const population = props.population ?? "schedule";
  const measure = props.measure ?? "courses";
  const student = subject.kind === "student" ? subject.student : null;

  const { rows, total } = useMemo(() => {
    const codes = new Set<string>();
    if (population === "schedule") {
      for (const c of courses) codes.add(c.code);
    } else if (student) {
      for (const c of student.completed) codes.add(c);
      if (population === "mine") {
        for (const id of student.planned) {
          const s = sectionById.get(id);
          if (s) codes.add(s.course);
        }
      }
    }
    const acc: Record<Group, { value: number; depts: Map<string, number> }> = {
      stem: { value: 0, depts: new Map() },
      non: { value: 0, depts: new Map() },
    };
    for (const code of codes) {
      const dept = deptOf(code);
      const g: Group = STEM_DEPTS.has(dept.toUpperCase()) ? "stem" : "non";
      const v = measure === "credits" ? Number(courseByCode.get(code)?.credits ?? 0) : 1;
      acc[g].value += v;
      acc[g].depts.set(dept, (acc[g].depts.get(dept) ?? 0) + v);
    }
    const rows = GROUPS.map((g) => ({
      ...g,
      value: acc[g.key].value,
      depts: [...acc[g.key].depts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    }));
    return { rows, total: rows[0].value + rows[1].value };
  }, [student, population, measure]);

  const unit = measure === "credits" ? "credit" : "course";
  const popText =
    population === "completed"
      ? "your completed courses"
      : population === "mine"
        ? "your completed and planned courses"
        : "this term's schedule";

  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });

  const stem = rows[0].value;
  const non = rows[1].value;
  const ratio = non > 0 ? (stem / non).toFixed(1) : null;
  const maxVal = Math.max(1, stem, non);
  const barW = 180;

  return (
    <figure className="vbg-chart">
      {total === 0 ? (
        <p className="vbg-meta">No {unit}s to count in {popText}.</p>
      ) : markType === "bars" ? (
        <svg viewBox={`0 0 ${W} 92`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`Bar chart of STEM and non-STEM ${unit}s in ${popText}`}>
          {rows.map((r, i) => {
            const y = 14 + i * 38;
            const w = (r.value / maxVal) * barW;
            return (
              <g key={r.key}>
                <text x={0} y={y + 14} className="vbg-meta">{r.label}</text>
                <motion.rect x={80} y={y} height={20} rx={2} fill={r.color} initial={false} animate={{ width: Math.max(w, r.value ? 2 : 0) }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
                <text x={80 + w + 6} y={y + 14} className="vbg-meta">
                  {r.value} · {fmtPct(r.value / total)}
                </text>
              </g>
            );
          })}
          <line x1={80} x2={80} y1={6} y2={86} stroke="var(--vbg-border-default)" />
        </svg>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={`${markType === "donut" ? "Donut" : "Pie"} chart of STEM and non-STEM ${unit}s in ${popText}`}>
          {slices.map((s) =>
            s.value > 0 ? (
              <motion.path key={s.key} d={slicePath(s.a0, s.a1, markType === "donut" ? RI : 0)} fill={s.color} fillRule="evenodd" stroke="var(--vbg-surface-primary)" strokeWidth={2} initial={false} animate={{ d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0) }} />
            ) : null,
          )}
          {slices.map((s) => {
            if (s.value === 0) return null;
            const mid = s.frac >= 1 - 1e-6 ? 0 : (s.a0 + s.a1) / 2;
            const [lx, ly] = pt(R + 14, mid);
            const anchor = Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end";
            const dy = ly < CY - R * 0.6 ? -14 : 0;
            return (
              <text key={s.key} x={lx} y={ly + dy} textAnchor={anchor} className="vbg-meta">
                <tspan x={lx}>{s.label}</tspan>
                <tspan x={lx} dy={14}>{s.value} · {fmtPct(s.frac)}</tspan>
              </text>
            );
          })}
          {markType === "donut" && (
            <text x={CX} y={CY} textAnchor="middle" className="vbg-meta">
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
                <th scope="col">Group</th>
                <th scope="col" className="vbg-numeric">{measure === "credits" ? "Credits" : "Courses"}</th>
                <th scope="col" className="vbg-numeric">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    {r.label}{" "}
                    <span className="vbg-meta">
                      {r.depts.length ? r.depts.map(([d, n]) => `${d} ${n}`).join(", ") : "none"}
                    </span>
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
        {total > 0
          ? `In ${popText}, ${plural(stem, unit)} ${stem === 1 ? "is" : "are"} STEM and ${plural(non, unit)} ${non === 1 ? "is" : "are"} not${ratio ? `, a ratio of ${ratio} to 1` : ""}. `
          : ""}
        STEM counts computer science, mathematics, statistics, the natural sciences and engineering, by department.
      </figcaption>
    </figure>
  );
}
