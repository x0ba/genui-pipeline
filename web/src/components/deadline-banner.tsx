import { useSubject, TERM } from "@kit";

type Props = { props: Record<string, string> };

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
const daysUntil = (d: string) => Math.round((Date.parse(d) - Date.parse(TERM.today)) / 86_400_000);

export default function DeadlineBanner({ props }: Props) {
  const subject = useSubject();
  const days = daysUntil(TERM.registrationOpens);
  const opens = `Registration for ${TERM.name} opens ${fmtDate(TERM.registrationOpens)}, in ${days} days.`;
  let extra = "";
  if (subject.kind === "student") {
    const holds = subject.student.holds;
    extra = holds.length ? ` A hold blocks your registration: ${holds.map((h) => h.note.toLowerCase()).join("; ")}.` : " You have no holds.";
  } else {
    const held = subject.advisees.filter((a) => a.holds.length).length;
    const noPlan = subject.advisees.filter((a) => a.planStatus === "not-started").length;
    extra = ` ${held} advisees have holds and ${noPlan} have not started a plan.`;
  }

  if (props.tone === "prominent") {
    return (
      <div className="vbg-band vbg-custom-banner" data-tone="contrast" role="status">
        <p className="vbg-heading-16">{opens}</p>
        <p>{extra.trim()}</p>
      </div>
    );
  }
  return (
    <p className="vbg-custom-banner-quiet" role="status">
      {opens}
      <span className="vbg-meta">{extra}</span>
    </p>
  );
}
