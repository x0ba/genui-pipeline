import { motion } from "motion/react";
import { useMemo } from "react";
import { courses, fmtPct, sections, students, useSelection, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Row = { code: string; value: number; label: string; detail: string };

const MEASURE_TITLE: Record<string, string> = {
  "fill-rate": "Seats filled",
  waitlist: "Students on waitlists",
  advisees: "Your advisees planning each course",
};

export default function DemandChart({ props }: Props) {
  const subject = useSubject();
  const { selectCourse } = useSelection();
  const measure = props.measure ?? "fill-rate";
  const people = subject.kind === "advisor" ? subject.advisees : students;

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const c of courses) {
      const secs = sections.filter((s) => s.course === c.code);
      const cap = secs.reduce((n, s) => n + s.capacity, 0);
      const enrolled = secs.reduce((n, s) => n + s.enrolled, 0);
      const waitlist = secs.reduce((n, s) => n + s.waitlist, 0);
      if (props.scope === "constrained" && enrolled < cap && waitlist === 0) continue;
      if (props.scope === "cs" && c.dept !== "CS") continue;
      const planning = people.filter((p) => p.planned.some((id) => id.startsWith(c.code.replace(" ", "") + "-"))).length;
      const row: Record<string, Row> = {
        "fill-rate": { code: c.code, value: enrolled / cap, label: fmtPct(enrolled / cap), detail: `${enrolled}/${cap}` },
        waitlist: { code: c.code, value: waitlist, label: String(waitlist), detail: `${secs.length} sections` },
        advisees: { code: c.code, value: planning, label: String(planning), detail: waitlist ? `waitlist ${waitlist}` : "" },
      };
      out.push(row[measure]);
    }
    return out.filter((r) => measure === "fill-rate" || r.value > 0).sort((a, b) => b.value - a.value).slice(0, 14);
  }, [props.scope, measure, people]);

  const max = measure === "fill-rate" ? 1 : Math.max(1, ...rows.map((r) => r.value));

  return (
    <figure className="vbg-chart">
      <div className="vbg-chart-header">
        <p className="vbg-heading-16">{MEASURE_TITLE[measure]}</p>
      </div>
      <ol className="vbg-bar-list vbg-custom-demand" tabIndex={0} aria-label={`${MEASURE_TITLE[measure]} by course`}>
        {rows.map((r) => (
          <motion.li layout="position" key={r.code} className="vbg-bar" data-role={measure === "fill-rate" && r.value >= 1 ? "primary" : undefined}>
            <button type="button" className="vbg-bar-label vbg-custom-text-button" onClick={() => selectCourse(r.code)}>
              {r.code}
            </button>
            <span className="vbg-bar-value vbg-numeric">
              {r.label}
              {r.detail && <span className="vbg-meta"> {r.detail}</span>}
            </span>
            <span className="vbg-bar-track">
              <motion.span className="vbg-bar-fill" initial={false} animate={{ width: `${Math.min(1, r.value / max) * 100}%` }} />
            </span>
          </motion.li>
        ))}
      </ol>
      <figcaption className="vbg-caption">
        {measure === "fill-rate"
          ? "All sections of a course combined, as of October 28. Full courses are drawn darker."
          : measure === "waitlist"
            ? "Students waiting for a seat across all sections of each course."
            : "Advisees with a section of the course in their plan. Courses nobody planned are omitted."}
        {rows.length === 0 ? " No courses match." : ""}
      </figcaption>
    </figure>
  );
}
