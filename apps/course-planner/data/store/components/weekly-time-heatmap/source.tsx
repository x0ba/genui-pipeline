import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { DAYS, DAY_NAMES, courseByCode, fmtTime, heat, plural, requirementStatus, sections, useSelection, useSubject } from "@kit";

type Props = Record<string, string>;
type Bin = { start: number; end: number; label: string; long: string };

function dayName(d: string, i: number): string {
  const names: any = DAY_NAMES;
  const n = Array.isArray(names) ? names[i] : names?.[d];
  return typeof n === "string" ? n : d;
}

export default function WeeklyTimeHeatmap(props: Props) {
  const subject = useSubject();
  const { selectCourse } = useSelection();
  const bins = props.bins ?? "hour";
  const count = props.count ?? "courses";
  const scope = props.scope ?? "all";
  const [picked, setPicked] = useState<{ day: number; bin: number } | null>(null);

  const remaining = useMemo(() => {
    if (subject.kind !== "student") return new Set<string>();
    return new Set(requirementStatus(subject.student).flatMap((r: any) => r.remaining as string[]));
  }, [subject]);

  const pool = useMemo(
    () =>
      sections.filter((s) => {
        const c = courseByCode.get(s.course);
        if (scope === "cs") return c?.dept === "CS";
        if (scope === "remaining") return remaining.has(s.course);
        if (scope === "open") return s.enrolled < s.capacity;
        return true;
      }),
    [scope, remaining],
  );

  const rows: Bin[] = useMemo(() => {
    if (bins === "period") {
      return [
        { start: 0, end: 720, label: "Morning", long: "Morning, before noon" },
        { start: 720, end: 1020, label: "Afternoon", long: "Afternoon, noon to 5 PM" },
        { start: 1020, end: 1440, label: "Evening", long: "Evening, 5 PM or later" },
      ];
    }
    const step = bins === "half-hour" ? 30 : bins === "two-hour" ? 120 : 60;
    const minStart = Math.min(...sections.map((s) => s.meeting.start));
    const maxEnd = Math.max(...sections.map((s) => s.meeting.end));
    const first = Math.floor(minStart / step) * step;
    const out: Bin[] = [];
    for (let t = first; t < maxEnd; t += step) {
      out.push({ start: t, end: t + step, label: fmtTime(t), long: `${fmtTime(t)} to ${fmtTime(t + step)}` });
    }
    return out;
  }, [bins]);

  const grid = useMemo(
    () =>
      rows.map((b) =>
        DAYS.map((d) => {
          const hits = pool.filter((s) => s.meeting.days.includes(d as any) && s.meeting.start < b.end && s.meeting.end > b.start);
          const codes = Array.from(new Set(hits.map((s) => s.course))).sort();
          return { n: count === "sections" ? hits.length : codes.length, codes, hits };
        }),
      ),
    [rows, pool, count],
  );

  const max = Math.max(1, ...grid.flat().map((c) => c.n));
  let best = { n: -1, r: 0, d: 0 };
  grid.forEach((row, r) => row.forEach((c, d) => { if (c.n > best.n) best = { n: c.n, r, d }; }));
  const unit = count === "sections" ? "section" : "course";
  const sel = picked && grid[picked.bin]?.[picked.day] ? { ...picked, cell: grid[picked.bin][picked.day] } : null;

  return (
    <figure className="vbg-chart vbg-custom-stack-4">
      <div className="vbg-table-wrap" style={{ overflowX: "auto" }}>
        <table aria-label={`Number of ${unit}s meeting in each day and time frame`} style={{ borderCollapse: "separate", borderSpacing: 2, width: "100%" }}>
          <thead>
            <tr>
              <th scope="col" className="vbg-meta" style={{ textAlign: "left" }}>Time</th>
              {DAYS.map((d, i) => (
                <th key={d} scope="col" className="vbg-numeric" style={{ textAlign: "center" }} title={dayName(d, i)}>
                  {dayName(d, i).slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, r) => (
              <tr key={b.start}>
                <th scope="row" className="vbg-meta" style={{ textAlign: "left", whiteSpace: "nowrap" }} title={b.long}>
                  {b.label}
                </th>
                {DAYS.map((d, i) => {
                  const c = grid[r][i];
                  const h = heat(c.n / max);
                  const on = picked?.bin === r && picked?.day === i;
                  return (
                    <td key={d} className="vbg-numeric" style={{ background: h.fill, color: h.ink, padding: 0, textAlign: "center", borderRadius: "var(--vbg-radius-small)", outline: on ? "2px solid var(--vbg-border-strong)" : undefined, outlineOffset: -2 }}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${dayName(d, i)}, ${b.long}: ${plural(c.n, unit)}`}
                        onClick={() => setPicked(on ? null : { day: i, bin: r })}
                        style={{ all: "unset", boxSizing: "border-box", display: "block", width: "100%", minWidth: 36, padding: "var(--vbg-space-2) var(--vbg-space-1)", textAlign: "center", cursor: "pointer", color: h.ink, background: h.fill }}
                      >
                        {c.n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <motion.div layout className="vbg-custom-stack-2">
          <p className="vbg-heading-16">
            {dayName(DAYS[sel.day], sel.day)}, {rows[sel.bin].long}: {plural(sel.cell.n, unit)}
          </p>
          {sel.cell.codes.length === 0 ? (
            <p className="vbg-meta">Nothing meets then.</p>
          ) : (
            <ul className="vbg-custom-plain" style={{ display: "flex", flexWrap: "wrap", gap: "var(--vbg-space-2)" }}>
              {sel.cell.codes.map((code) => (
                <li key={code}>
                  <button type="button" className="vbg-custom-text-button" onClick={() => selectCourse(code)}>
                    {code}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
      <figcaption className="vbg-caption">
        {best.n > 0
          ? `Darker cells have more ${unit}s in session. Busiest: ${dayName(DAYS[best.d], best.d)}, ${rows[best.r].long}, with ${plural(best.n, unit)}. A class counts in every time frame it overlaps. Select a cell to list its courses.`
          : "No sections match this filter."}
      </figcaption>
    </figure>
  );
}
