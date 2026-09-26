import { motion } from "motion/react";
import { courseByCode, DAY_NAMES, DAYS, fmtTime, overlaps, usePlan, useSelection, useSubject, type Day, type Meeting } from "@kit";

type Props = { props: Record<string, string> };
type Item = { key: string; label: string; detail: string; meeting: Meeting; kind: "class" | "blocked"; conflict: boolean; course?: string };

const START = 8 * 60;
const END = 20 * 60;
const HOURS = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);
const spring = { type: "spring", stiffness: 380, damping: 38 } as const;

export default function WeekCalendar({ props }: Props) {
  const subject = useSubject();
  const plan = usePlan();
  const { selectCourse } = useSelection();
  if (subject.kind !== "student") return <p className="vbg-meta">The weekly schedule is for students.</p>;
  const showBlocked = props.blocked !== "hide";

  const classes: Item[] = plan.sections.map((s) => ({
    key: s.id,
    label: s.course,
    detail: `${courseByCode.get(s.course)?.title ?? ""} · ${s.room}`,
    meeting: s.meeting,
    kind: "class",
    course: s.course,
    conflict:
      plan.sections.some((o) => o.id !== s.id && overlaps(o.meeting, s.meeting)) ||
      subject.student.blocked.some((b) => overlaps(b, s.meeting)),
  }));
  const blocked: Item[] = subject.student.blocked.map((b, i) => ({
    key: `blocked-${i}`,
    label: b.label,
    detail: "Blocked",
    meeting: b,
    kind: "blocked",
    conflict: false,
  }));
  const items = showBlocked ? [...blocked, ...classes] : classes;
  const conflicts = classes.filter((c) => c.conflict).length;

  const perDay = (day: Day) => items.filter((i) => i.meeting.days.includes(day)).sort((a, b) => a.meeting.start - b.meeting.start);

  const summary = (
    <p className="vbg-meta" aria-live="polite">
      {plan.sections.length} classes this week
      {conflicts > 0 ? (
        <span data-state="error">
          {" "}
          · {conflicts} {conflicts === 1 ? "class overlaps" : "classes overlap"} another commitment
        </span>
      ) : (
        " · no conflicts"
      )}
    </p>
  );

  if (props.primaryView === "agenda") {
    return (
      <div className="vbg-custom-stack-4">
        {summary}
        <ol className="vbg-custom-agenda">
          {DAYS.map((day) => (
            <li key={day}>
              <h3 className="vbg-heading-16">{DAY_NAMES[day]}</h3>
              <ul>
                {perDay(day).map((item) => (
                  <motion.li
                    layout
                    layoutId={`${item.key}-${day}`}
                    transition={spring}
                    key={item.key}
                    data-kind={item.kind}
                    data-state={item.conflict ? "error" : undefined}
                  >
                    <span className="vbg-custom-agenda-time">
                      {fmtTime(item.meeting.start)}–{fmtTime(item.meeting.end)}
                    </span>
                    <span>
                      <strong>{item.label}</strong> {item.detail}
                      {item.conflict && <span className="vbg-custom-note">Conflict</span>}
                    </span>
                  </motion.li>
                ))}
                {perDay(day).length === 0 && <li className="vbg-meta">Free</li>}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const pct = (m: number) => ((m - START) / (END - START)) * 100;
  return (
    <div className="vbg-custom-stack-4">
      {summary}
      <div className="vbg-custom-week" role="table" aria-label="Weekly schedule">
        <div className="vbg-custom-week-axis" aria-hidden>
          {HOURS.map((h) => (
            <span key={h} style={{ top: `${pct(h)}%` }}>
              {fmtTime(h).replace(":00", "")}
            </span>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="vbg-custom-week-day" role="row">
            <div className="vbg-custom-week-head" role="columnheader">
              {DAY_NAMES[day].slice(0, 3)}
            </div>
            <div className="vbg-custom-week-body">
              {HOURS.map((h) => (
                <span key={h} className="vbg-custom-week-line" style={{ top: `${pct(h)}%` }} aria-hidden />
              ))}
              {perDay(day).map((item) => (
                <motion.button
                  type="button"
                  layout
                  layoutId={`${item.key}-${day}`}
                  transition={spring}
                  key={item.key}
                  role="cell"
                  className="vbg-custom-week-item"
                  data-kind={item.kind}
                  data-state={item.conflict ? "error" : undefined}
                  style={{ top: `${pct(item.meeting.start)}%`, height: `${pct(item.meeting.end) - pct(item.meeting.start)}%` }}
                  onClick={() => item.course && selectCourse(item.course)}
                  disabled={!item.course}
                  aria-label={`${item.label}, ${fmtTime(item.meeting.start)} to ${fmtTime(item.meeting.end)}${item.conflict ? ", conflict" : ""}`}
                >
                  <strong>{item.label}</strong>
                  <span>{fmtTime(item.meeting.start)}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
