import { creditsOf, requirementStatus, risk, scheduleConflicts, useOverrides, usePlan, useSubject, TERM } from "@kit";

type Props = { props: Record<string, string> };
type Stat = { label: string; value: string; detail: string };

const daysSince = (date: string) => Math.round((Date.parse(TERM.today) - Date.parse(date)) / 86_400_000);

export default function StatStrip({ props }: Props) {
  const subject = useSubject();
  const plan = usePlan();
  const { requests } = useOverrides();
  const focus = props.focus ?? "progress";
  let stats: Stat[];

  if (subject.kind === "student") {
    const s = subject.student;
    const status = requirementStatus(s);
    const remaining = status.reduce((n, r) => n + Math.max(0, r.needed - r.done.length - r.planned.length), 0);
    const credits = creditsOf(plan.sections.map((x) => x.course));
    const hours = plan.sections.reduce((h, x) => h + (x.meeting.days.length * (x.meeting.end - x.meeting.start)) / 60, 0);
    const conflicts = scheduleConflicts(s, plan.sections).length;
    const waitlisted = plan.sections.filter((x) => x.enrolled >= x.capacity).length;
    stats = {
      progress: [
        { label: "Credits earned", value: String(creditsOf(s.completed)), detail: "of 120 for the degree" },
        { label: "Courses remaining", value: String(remaining), detail: "after this term's plan" },
        { label: "Planned this term", value: `${credits} cr`, detail: `${plan.sections.length} sections` },
      ],
      risk: [
        { label: "Conflicts", value: String(conflicts), detail: conflicts ? "in your planned week" : "none in your plan" },
        { label: "Full sections", value: String(waitlisted), detail: "you would be waitlisted" },
        { label: "Holds", value: String(s.holds.length), detail: s.holds[0]?.note ?? "nothing blocks registration" },
      ],
      workload: [
        { label: "Planned credits", value: String(credits), detail: credits < 12 ? "below full-time" : "full-time" },
        { label: "Class hours", value: hours.toFixed(1), detail: "per week" },
        { label: "Waitlisted", value: String(waitlisted), detail: "sections" },
      ],
    }[focus] as Stat[];
  } else {
    const risks = subject.advisees.map((a) => ({ a, r: risk(a) }));
    const pending = requests.filter((r) => r.status === "pending").length;
    stats = {
      progress: [
        { label: "Advisees", value: String(subject.advisees.length), detail: subject.advisor.dept },
        { label: "Plans submitted", value: String(subject.advisees.filter((a) => a.planStatus === "submitted").length), detail: "awaiting your review" },
        { label: "Plans approved", value: String(subject.advisees.filter((a) => a.planStatus === "approved").length), detail: `of ${subject.advisees.length}` },
      ],
      risk: [
        { label: "Need attention", value: String(risks.filter((x) => x.r.score > 0).length), detail: "advisees with at least one flag" },
        { label: "Pending overrides", value: String(pending), detail: "waiting for your decision" },
        { label: "Holds", value: String(risks.filter((x) => x.a.holds.length).length), detail: "advisees blocked from registering" },
      ],
      workload: [
        { label: "Plans to review", value: String(subject.advisees.filter((a) => a.planStatus === "submitted").length), detail: "submitted" },
        { label: "Pending overrides", value: String(pending), detail: "requests" },
        { label: "No recent contact", value: String(subject.advisees.filter((a) => daysSince(a.lastContact) > 30).length), detail: "over 30 days" },
      ],
    }[focus] as Stat[];
  }

  return (
    <div className="vbg-stat-strip">
      {stats.map((s) => (
        <div className="vbg-stat" key={s.label}>
          <p className="vbg-stat-label">{s.label}</p>
          <p className="vbg-stat-value">{s.value}</p>
          <p className="vbg-stat-detail">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}
