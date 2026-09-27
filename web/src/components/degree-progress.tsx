import { motion } from "motion/react";
import { courseByCode, missingPrereqs, requirementStatus, useSelection, useSubject } from "@kit";

type Props = { props: Record<string, string> };

export default function DegreeProgress({ props }: Props) {
  const subject = useSubject();
  const { selectCourse } = useSelection();
  if (subject.kind !== "student") return <p className="vbg-meta">Degree progress is shown for students.</p>;
  const status = requirementStatus(subject.student);
  const nextSteps = props.detail === "next-steps";

  const next = (r: (typeof status)[number]) =>
    r.remaining.filter((c) => missingPrereqs(subject.student, c).length === 0).slice(0, Math.max(0, r.needed - r.done.length - r.planned.length));

  if (props.presentation === "checklist") {
    return (
      <div className="vbg-custom-stack-6">
        {status.map((r) => (
          <motion.section layout="position" key={r.id} className="vbg-custom-stack-2">
            <h3 className="vbg-heading-16">
              {r.title}
              <span className="vbg-meta">
                {" "}
                {r.choose ? `choose ${r.choose} of ${r.courses.length}` : `${r.needed} courses`}
              </span>
            </h3>
            <ul className="vbg-custom-checklist">
              {[...r.done, ...r.planned, ...(r.choose ? next(r) : r.remaining)].map((code) => {
                const state = r.done.includes(code) ? "Completed" : r.planned.includes(code) ? "Planned" : "Remaining";
                return (
                  <li key={code} data-status={state.toLowerCase()}>
                    <span className="vbg-custom-check" aria-hidden>
                      {state === "Completed" ? "✓" : state === "Planned" ? "◐" : "○"}
                    </span>
                    <button type="button" className="vbg-custom-text-button" onClick={() => selectCourse(code)}>
                      {code}
                    </button>
                    <span>{courseByCode.get(code)?.title}</span>
                    <span className="vbg-meta">{state}</span>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))}
      </div>
    );
  }

  return (
    <div className="vbg-custom-progress" role="list">
      {status.map((r) => {
        const done = r.done.length / r.needed;
        const planned = r.planned.length / r.needed;
        const upcoming = next(r);
        return (
          <motion.div layout="position" key={r.id} className="vbg-custom-progress-row" role="listitem">
            <span className="vbg-custom-progress-label">{r.title}</span>
            <span className="vbg-custom-progress-track" aria-hidden>
              <motion.span className="vbg-custom-progress-done" initial={false} animate={{ width: `${done * 100}%` }} />
              <motion.span className="vbg-custom-progress-planned" initial={false} animate={{ width: `${planned * 100}%` }} />
            </span>
            <span className="vbg-custom-progress-value vbg-numeric">
              {r.done.length + r.planned.length} of {r.needed}
            </span>
            {nextSteps && (
              <span className="vbg-custom-progress-next vbg-meta">
                {r.planned.length ? `Planned: ${r.planned.join(", ")}. ` : ""}
                {upcoming.length ? `Next: ${upcoming.join(", ")}` : r.done.length + r.planned.length >= r.needed ? "Complete" : "Prerequisites needed first"}
              </span>
            )}
          </motion.div>
        );
      })}
      <p className="vbg-caption">Solid: completed. Light: planned this term. Counts are courses.</p>
    </div>
  );
}
