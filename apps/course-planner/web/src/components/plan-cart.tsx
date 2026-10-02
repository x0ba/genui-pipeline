import type { PropsOf } from "@malleable/core";
import type { planCart } from "../../../shared/library";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { collapse, courseByCode, creditsOf, enter, fmtMeeting, scheduleConflicts, usePlan, useSubject } from "@kit";

type Props = PropsOf<typeof planCart>;

export default function PlanCart(props: Props) {
  const subject = useSubject();
  const plan = usePlan();
  const [reviewing, setReviewing] = useState(false);
  if (subject.kind !== "student") return <p className="vbg-meta">Enrollment plans belong to students.</p>;

  const conflicts = scheduleConflicts(subject.student, plan.sections);
  const credits = creditsOf(plan.sections.map((s) => s.course));
  const waitlisted = plan.sections.filter((s) => s.enrolled >= s.capacity);
  const detailed = props.summary !== "compact";
  const submitted = plan.status === "submitted" || plan.status === "approved";

  const warnings = [
    ...conflicts.map((c) => c.label),
    ...waitlisted.map((s) => `${s.course} is full; you would be waitlist position ${s.waitlist + 1}`),
    ...(credits < 12 ? [`${credits} credits is below the 12 needed for full-time status`] : []),
  ];

  return (
    <div className="vbg-custom-stack-4">
      <ul className="vbg-custom-plan">
        <AnimatePresence initial={false}>
          {plan.sections.map((s) => {
            const clash = conflicts.filter((c) => c.a === s.id || c.b === s.id);
            return (
              // Rows open and close in place, so everything below moves with them.
              <motion.li key={s.id} {...collapse}>
                <div className="vbg-custom-plan-item">
                  <div className="vbg-custom-plan-row">
                    <span>
                      <strong>{s.course}</strong> {detailed ? courseByCode.get(s.course)?.title : ""}
                    </span>
                    <span className="vbg-numeric">{courseByCode.get(s.course)?.credits} cr</span>
                  </div>
                  {detailed && (
                    <div className="vbg-meta">
                      {fmtMeeting(s.meeting)} · {s.instructor} · {s.enrolled}/{s.capacity} seats
                      {clash.map((c) => (
                        <span key={c.label} className="vbg-custom-note" data-state="error">
                          {c.label}
                        </span>
                      ))}
                      {s.enrolled >= s.capacity && (
                        <span className="vbg-custom-note" data-state="warning">
                          Full, {s.waitlist} on waitlist
                        </span>
                      )}
                    </div>
                  )}
                  {!submitted && (
                    <button type="button" className="vbg-custom-text-button" onClick={() => plan.remove(s.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <div className="vbg-custom-plan-row vbg-custom-plan-total">
        <span>Total</span>
        <span className="vbg-numeric">{credits} credits</span>
      </div>
      {submitted ? (
        <p>Plan submitted. Your advisor reviews it before registration opens.</p>
      ) : props.confirmation === "direct" || !reviewing ? (
        <button
          type="button"
          className="vbg-button"
          disabled={plan.sections.length === 0}
          onClick={() => (props.confirmation === "direct" ? plan.submit() : setReviewing(true))}
        >
          {props.confirmation === "direct" ? "Submit plan" : "Review and submit"}
        </button>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={enter} className="vbg-custom-stack-2" role="group" aria-label="Review plan">
          {warnings.length ? (
            <ul className="vbg-custom-warnings">
              {warnings.map((w) => (
                <li key={w} data-state="warning">
                  {w}
                </li>
              ))}
            </ul>
          ) : (
            <p>No conflicts or waitlists.</p>
          )}
          <div className="vbg-custom-actions">
            <button type="button" className="vbg-button" onClick={() => (plan.submit(), setReviewing(false))}>
              Confirm submission
            </button>
            <button type="button" className="vbg-custom-text-button" onClick={() => setReviewing(false)}>
              Keep editing
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
