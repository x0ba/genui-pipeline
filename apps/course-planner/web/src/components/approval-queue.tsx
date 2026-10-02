import type { PropsOf } from "@malleable/core";
import type { approvalQueue } from "../../../shared/library";
import { AnimatePresence, motion } from "motion/react";
import { collapse, enter, missingPrereqs, studentById, useOverrides, useSelection, type OverrideRequest } from "@kit";

type Props = PropsOf<typeof approvalQueue>;

const KIND: Record<OverrideRequest["kind"], string> = {
  prerequisite: "Prerequisite",
  capacity: "Capacity",
  "credit-overload": "Credit overload",
};

export default function ApprovalQueue(props: Props) {
  const { requests, decide } = useOverrides();
  const { student, selectStudent } = useSelection();
  const inline = props.actions === "inline";
  const pending = requests.filter((r) => r.status === "pending").sort((a, b) => b.submitted.localeCompare(a.submitted));
  const decided = requests.filter((r) => r.status !== "pending");

  const groupKey = (r: OverrideRequest) => (props.grouping === "kind" ? KIND[r.kind] : props.grouping === "course" ? r.course : "");
  const groups = new Map<string, OverrideRequest[]>();
  for (const r of pending) groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]);

  return (
    <div className="vbg-custom-stack-4">
      <div className="vbg-custom-bulk">
        <span className="vbg-meta" aria-live="polite">
          {pending.length} pending · {decided.length} decided
        </span>
        {inline && pending.length > 1 && (
          <button type="button" className="vbg-custom-text-button" onClick={() => decide(pending.filter((r) => r.kind !== "credit-overload").map((r) => r.id), "approved")}>
            Approve all prerequisite and capacity requests
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {[...groups.entries()].map(([group, items]) => (
          // A group closes with its last request instead of vanishing under it.
          <motion.section key={group || "all"} className="vbg-custom-reveal" {...collapse}>
            <div className="vbg-custom-stack-2">
              {group && <h3 className="vbg-heading-16">{group}</h3>}
              <ul className="vbg-custom-queue">
                <AnimatePresence initial={false}>
                  {items.map((r) => {
                    const s = studentById.get(r.student)!;
                    const missing = r.kind === "prerequisite" ? missingPrereqs(s, r.course) : [];
                    return (
                      // Decided requests close up in place; the rows below follow the height.
                      <motion.li key={r.id} {...collapse} aria-current={student === r.student}>
                        <div className="vbg-custom-queue-item">
                          <div className="vbg-custom-queue-main">
                            <p>
                              <strong>{s.name}</strong> · {r.course} · {KIND[r.kind]}
                            </p>
                            <p className="vbg-meta">
                              {r.reason}
                              {missing.length ? ` Missing ${missing.join(", ")}.` : ""} Submitted {r.submitted}.
                            </p>
                          </div>
                          <div className="vbg-custom-actions">
                            {inline ? (
                              <>
                                <button type="button" className="vbg-button" onClick={() => decide(r.id, "approved")}>
                                  Approve
                                </button>
                                <button type="button" className="vbg-custom-text-button" onClick={() => decide(r.id, "denied")}>
                                  Deny
                                </button>
                              </>
                            ) : (
                              <button type="button" className="vbg-custom-text-button" onClick={() => selectStudent(r.student)}>
                                Review {s.name.split(" ")[0]}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          </motion.section>
        ))}
      </AnimatePresence>
      {pending.length === 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...enter, delay: 0.15 }}>
          No pending requests.
        </motion.p>
      )}
    </div>
  );
}
