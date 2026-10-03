import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { DAYS, courseByCode, fmtMeeting, fmtTime, heat, plural, risk, sectionById, useSelection, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Hit = { studentId: string; name: string; course: string; meeting: string };
type Cell = { day: string; di: number; ri: number; start: number; count: number; hits: Hit[] };

const DAY_LABEL: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
const DAY_LONG: Record<string, string> = { M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday" };

export default function AdviseeMeetingHeatmap({ props }: Props) {
  const subject = useSubject();
  const { selectStudent } = useSelection();
  const scope = props.scope ?? "all";
  const bin = props.binSize === "half-hour" ? 30 : 60;
  const annotation = props.annotation ?? "counts";
  const people = subject.kind === "advisor" ? subject.advisees : [subject.student];
  const [picked, setPicked] = useState<string | null>(null);

  const model = useMemo(() => {
    const pool = scope === "flagged" ? people.filter((p) => risk(p).flags.length > 0) : people;
    const entries: { studentId: string; name: string; course: string; meeting: { days: string[]; start: number; end: number } }[] = [];
    const withClasses = new Set<string>();
    for (const p of pool) {
      for (const id of p.planned) {
        const sec = sectionById.get(id);
        if (!sec || !sec.meeting || sec.meeting.days.length === 0) continue;
        if (scope === "cs" && courseByCode.get(sec.course)?.dept !== "CS") continue;
        entries.push({ studentId: p.id, name: p.name, course: sec.course, meeting: sec.meeting });
        withClasses.add(p.id);
      }
    }
    let lo = 8 * 60;
    let hi = 17 * 60;
    if (entries.length) {
      lo = Math.min(lo, ...entries.map((e) => Math.floor(e.meeting.start / 60) * 60));
      hi = Math.max(hi, ...entries.map((e) => Math.ceil(e.meeting.end / 60) * 60));
    }
    const rows: number[] = [];
    for (let t = lo; t < hi; t += bin) rows.push(t);
    const cells: Cell[] = [];
    DAYS.forEach((day: string, di: number) => {
      rows.forEach((start, ri) => {
        const hits: Hit[] = [];
        const seen = new Set<string>();
        for (const e of entries) {
          if (!e.meeting.days.includes(day)) continue;
          if (e.meeting.start < start + bin && e.meeting.end > start) {
            hits.push({ studentId: e.studentId, name: e.name, course: e.course, meeting: fmtMeeting(e.meeting as never) });
            seen.add(e.studentId);
          }
        }
        hits.sort((a, b) => a.name.localeCompare(b.name));
        cells.push({ day, di, ri, start, count: seen.size, hits });
      });
    });
    const max = Math.max(1, ...cells.map((c) => c.count));
    const ranked = [...cells].filter((c) => c.count > 0).sort((a, b) => b.count - a.count || a.di - b.di || a.ri - b.ri);
    const peaks = new Set(ranked.slice(0, 3).map((c) => `${c.day}-${c.start}`));
    const core = cells.filter((c) => c.start >= 9 * 60 && c.start + bin <= 17 * 60);
    const quiet = [...core].sort((a, b) => a.count - b.count || a.di - b.di || a.ri - b.ri)[0];
    return { pool: pool.length, withClasses: withClasses.size, rows, cells, max, peaks, top: ranked[0], quiet };
  }, [people, scope, bin]);

  const labelW = 56;
  const colW = 100;
  const headerH = 26;
  const rowH = bin === 60 ? 28 : 18;
  const width = labelW + DAYS.length * colW;
  const height = headerH + model.rows.length * rowH + 4;
  const range = (c: Cell) => `${fmtTime(c.start)}–${fmtTime(c.start + bin)}`;
  const selected = model.cells.find((c) => `${c.day}-${c.start}` === picked) ?? null;
  const who = scope === "flagged" ? "flagged advisees" : "advisees";

  return (
    <figure className="vbg-chart vbg-custom-stack-4">
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxWidth: width, display: "block" }}
          role="group"
          aria-label={`Number of ${who} in class by weekday and ${bin === 60 ? "hour" : "half hour"}`}
        >
          {DAYS.map((d: string, di: number) => (
            <text key={d} x={labelW + di * colW + colW / 2} y={17} textAnchor="middle" className="vbg-meta" style={{ fill: "var(--vbg-text-primary)" }}>
              {DAY_LABEL[d] ?? d}
            </text>
          ))}
          {model.rows.map((t, ri) =>
            t % 60 === 0 ? (
              <text key={t} x={labelW - 8} y={headerH + ri * rowH + 12} textAnchor="end" className="vbg-meta">
                {fmtTime(t)}
              </text>
            ) : null,
          )}
          {model.cells.map((c) => {
            const key = `${c.day}-${c.start}`;
            const x = labelW + c.di * colW + 1;
            const y = headerH + c.ri * rowH + 1;
            const w = colW - 2;
            const cellH = rowH - 2;
            const h = heat(c.count / model.max);
            const isPeak = model.peaks.has(key);
            const isSel = picked === key;
            const showLabel = c.count > 0 && (annotation === "counts" || isPeak);
            const outline = isSel || (annotation === "peaks" && isPeak);
            return (
              <g
                key={key}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${DAY_LONG[c.day] ?? c.day} ${range(c)}: ${plural(c.count, "advisee")} in class`}
                onClick={() => setPicked(isSel ? null : key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPicked(isSel ? null : key);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={y} width={w} height={cellH} rx={2} fill={h.fill} />
                {outline && (
                  <rect x={x + 1} y={y + 1} width={w - 2} height={cellH - 2} rx={2} fill="none" stroke={h.ink} strokeWidth={2} />
                )}
                {showLabel && (
                  <text x={x + w / 2} y={y + cellH / 2 + 4} textAnchor="middle" className="vbg-meta" style={{ fill: h.ink }}>
                    {annotation === "peaks" && bin === 60 ? `${c.count} in class` : c.count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <table className="vbg-visually-hidden">
        <caption>{`${who} in class by time and weekday`}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {DAYS.map((d: string) => (
              <th key={d} scope="col" className="vbg-numeric">{DAY_LONG[d] ?? d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((t, ri) => (
            <tr key={t}>
              <th scope="row">{`${fmtTime(t)}–${fmtTime(t + bin)}`}</th>
              {DAYS.map((d: string, di: number) => {
                const c = model.cells.find((x) => x.di === di && x.ri === ri);
                return <td key={d} className="vbg-numeric">{c ? c.count : 0}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <figcaption className="vbg-caption">
        {model.withClasses === 0
          ? `None of the ${plural(model.pool, "advisee")} in this view have planned classes with meeting times yet.`
          : `${model.withClasses} of ${plural(model.pool, scope === "flagged" ? "flagged advisee" : "advisee")} have planned classes${scope === "cs" ? " in computer science" : ""}. ` +
            (model.top ? `Busiest: ${DAY_LONG[model.top.day]} ${range(model.top)}, with ${model.top.count} in class. ` : "") +
            (model.quiet ? `Quietest weekday slot between 9:00 and 17:00: ${DAY_LONG[model.quiet.day]} ${range(model.quiet)}, with ${model.quiet.count} in class.` : "")}
      </figcaption>

      <motion.div layout className="vbg-custom-stack-2" aria-live="polite">
        {selected ? (
          <>
            <p className="vbg-heading-16">{`${DAY_LONG[selected.day]} ${range(selected)}: ${plural(selected.count, "advisee")} in class`}</p>
            {selected.hits.length === 0 ? (
              <p className="vbg-meta">Nobody in this view has a class then.</p>
            ) : (
              <ul className="vbg-custom-plain vbg-custom-stack-2">
                {selected.hits.map((h, i) => (
                  <li key={`${h.studentId}-${h.course}-${i}`}>
                    <button type="button" className="vbg-custom-text-button" onClick={() => selectStudent(h.studentId)}>
                      {h.name}
                    </button>
                    <span className="vbg-meta">{` ${h.course}, ${h.meeting}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="vbg-meta">Select a cell to list the advisees in class at that time.</p>
        )}
      </motion.div>
    </figure>
  );
}
