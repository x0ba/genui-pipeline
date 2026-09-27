import { motion } from "motion/react";
import { courseByCode, fmtMeeting, requirementStatus, risk, scheduleConflicts, sectionById, useOverrides, useSelection, useStudent } from "@kit";

type Props = { props: Record<string, string> };

export default function AdviseeDetail({ props }: Props) {
  const { student: id } = useSelection();
  const student = useStudent(id);
  const { requests, decide } = useOverrides();
  if (!student) return <p className="vbg-meta">Select an advisee in the roster to see their plan, progress and flags.</p>;

  const planned = student.planned.map((x) => sectionById.get(x)!).filter(Boolean);
  const conflicts = scheduleConflicts(student, planned);
  const r = risk(student);
  const mine = requests.filter((o) => o.student === student.id);

  const blocks = {
    plan: (
      <div className="vbg-custom-stack-2">
        <h4 className="vbg-heading-16">Planned sections</h4>
        {planned.length === 0 ? (
          <p className="vbg-meta">No plan started.</p>
        ) : (
          <ul className="vbg-custom-plain">
            {planned.map((s) => (
              <li key={s.id}>
                <strong>{s.course}</strong> {courseByCode.get(s.course)?.title}
                <span className="vbg-meta"> · {fmtMeeting(s.meeting)}</span>
              </li>
            ))}
          </ul>
        )}
        {conflicts.map((c) => (
          <p key={c.label} data-state="error">
            {c.label}
          </p>
        ))}
      </div>
    ),
    requirements: (
      <div className="vbg-custom-stack-2">
        <h4 className="vbg-heading-16">Requirements</h4>
        <ul className="vbg-custom-plain">
          {requirementStatus(student).map((req) => (
            <li key={req.id}>
              {req.title}
              <span className="vbg-meta">
                {" "}
                {req.done.length} done, {req.planned.length} planned of {req.needed}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
    flags: (
      <div className="vbg-custom-stack-2">
        <h4 className="vbg-heading-16">Flags and requests</h4>
        {r.flags.length === 0 && mine.length === 0 && <p className="vbg-meta">Nothing needs attention.</p>}
        {r.flags.map((f) => (
          <p key={f} data-state="error">
            {f}
          </p>
        ))}
        {student.holds.map((h) => (
          <p key={h.kind} className="vbg-meta">
            Hold: {h.note}
          </p>
        ))}
        {mine.map((o) => (
          <div key={o.id} className="vbg-custom-request">
            <p>
              <strong>{o.course}</strong> {o.kind} override: {o.reason}
            </p>
            {o.status === "pending" ? (
              <div className="vbg-custom-actions">
                <button type="button" className="vbg-button" onClick={() => decide(o.id, "approved")}>
                  Approve
                </button>
                <button type="button" className="vbg-custom-text-button" onClick={() => decide(o.id, "denied")}>
                  Deny
                </button>
              </div>
            ) : (
              <p className="vbg-meta">{o.status === "approved" ? "Approved" : "Denied"}</p>
            )}
          </div>
        ))}
      </div>
    ),
  } as const;
  const order = [props.emphasis ?? "plan", ...Object.keys(blocks).filter((k) => k !== props.emphasis)] as (keyof typeof blocks)[];

  return (
    // Keyed by student: picking another advisee swaps the detail at once, and only
    // a change of emphasis on the same advisee reorders its sections.
    <article key={student.id} className="vbg-custom-stack-4">
      <header>
        <h3 className="vbg-heading-20">{student.name}</h3>
        <p className="vbg-meta">
          Year {student.year} · GPA {student.gpa.toFixed(2)} · {r.credits} credits planned · last contact {student.lastContact}
        </p>
      </header>
      {order.map((k) => (
        <motion.section layout="position" key={k}>
          {blocks[k]}
        </motion.section>
      ))}
    </article>
  );
}
