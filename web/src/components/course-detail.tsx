import { motion } from "motion/react";
import { fmtMeeting, fmtPct, missingPrereqs, overlaps, sections, usePlan, useSelection, useSubject } from "@kit";

type Props = { props: Record<string, string> };

export default function CourseDetail({ props }: Props) {
  const { course } = useSelection();
  const subject = useSubject();
  const plan = usePlan();
  const student = subject.kind === "student" ? subject.student : null;

  if (!course) return <p className="vbg-meta">Select a course to see its sections and prerequisites.</p>;

  const secs = sections.filter((s) => s.course === course.code);
  const missing = student ? missingPrereqs(student, course.code) : [];
  const busy = student ? [...student.blocked.map((b) => ({ ...b, what: b.label })), ...plan.sections.filter((s) => s.course !== course.code).map((s) => ({ ...s.meeting, what: s.course }))] : [];

  const blocks = {
    overview: (
      <div className="vbg-custom-stack-2">
        <p>{course.description}</p>
        <p className="vbg-meta">
          {course.prereqs.length === 0
            ? "No prerequisites."
            : `Prerequisites: ${course.prereqs.join(", ")}.`}
          {missing.length > 0 && <span data-state="error"> Missing {missing.join(", ")}.</span>}
        </p>
      </div>
    ),
    sections: (
      <div className="vbg-table-wrap">
        <table>
          <caption className="vbg-visually-hidden">Sections of {course.code}</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Instructor</th>
              <th scope="col" className="vbg-numeric">Seats</th>
              {student && <th scope="col"><span className="vbg-visually-hidden">Action</span></th>}
            </tr>
          </thead>
          <tbody>
            {secs.map((s) => {
              const clash = busy.find((b) => overlaps(s.meeting, b));
              const planned = plan.sections.some((p) => p.id === s.id);
              return (
                <tr key={s.id}>
                  <th scope="row">
                    {fmtMeeting(s.meeting)}
                    {clash && <span className="vbg-custom-note" data-state="error">Overlaps {clash.what}</span>}
                  </th>
                  <td>{s.instructor}</td>
                  <td className="vbg-numeric">
                    {s.enrolled}/{s.capacity}
                    {s.waitlist > 0 && <span className="vbg-custom-note" data-state="warning">Waitlist {s.waitlist}</span>}
                  </td>
                  {student && (
                    <td>
                      <button type="button" className="vbg-custom-text-button" disabled={planned} onClick={() => plan.add(s.id)}>
                        {planned ? "In plan" : "Add"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ),
    outcomes: (
      <div className="vbg-custom-stack-2">
        <p className="vbg-meta">Grades over the last three terms. Instructor rating {course.rating.toFixed(1)} of 5.</p>
        <div className="vbg-custom-grades" role="img" aria-label={Object.entries(course.grades).map(([g, v]) => `${g} ${fmtPct(v)}`).join(", ")}>
          {Object.entries(course.grades).map(([grade, share]) => (
            <div key={grade} style={{ flexGrow: share }} className="vbg-custom-grade">
              <span>{grade}</span>
              <span className="vbg-meta">{fmtPct(share)}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  } as const;

  const order = [props.emphasis ?? "overview", ...Object.keys(blocks).filter((k) => k !== props.emphasis)] as (keyof typeof blocks)[];

  return (
    <article className="vbg-custom-stack-4">
      <header>
        <h3 className="vbg-heading-20">
          {course.code} {course.title}
        </h3>
        <p className="vbg-meta">
          {course.credits} credits · {course.dept}
        </p>
      </header>
      {order.map((key) => (
        <motion.section layout key={key} transition={{ type: "spring", stiffness: 400, damping: 40 }}>
          {blocks[key]}
        </motion.section>
      ))}
    </article>
  );
}
