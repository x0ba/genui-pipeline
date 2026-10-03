import type { PropsOf } from "@malleable/core";
import type { adviseeTable } from "../../../shared/library";
import { motion } from "motion/react";
import { useMemo } from "react";
import { creditsOf, risk, sectionById, TERM, useNotify, useOverrides, useSelection, useStore, useSubject } from "@kit";

type Props = PropsOf<typeof adviseeTable>;

const daysSince = (date: string) => Math.round((Date.parse(TERM.today) - Date.parse(date)) / 86_400_000);
const STATUS: Record<string, string> = { "not-started": "Not started", draft: "Draft", submitted: "Submitted", approved: "Approved" };

export default function AdviseeTable(props: Props) {
  const subject = useSubject();
  const { student: selected, selectStudent, rows: checked, setRows } = useSelection();
  const { requests } = useOverrides();
  const store = useStore();
  const notify = useNotify();
  const multi = props.selection === "multi";
  const columns = props.columns ?? "academic";

  const rows = useMemo(() => {
    if (subject.kind !== "advisor") return [];
    const list = subject.advisees.map((s) => ({
      s,
      r: risk(s),
      credits: creditsOf(s.planned.map((id) => sectionById.get(id)?.course ?? "")),
      pending: requests.filter((o) => o.student === s.id && o.status === "pending").length,
    }));
    const sorters = {
      name: (a: (typeof list)[0], b: (typeof list)[0]) => a.s.name.localeCompare(b.s.name),
      risk: (a: (typeof list)[0], b: (typeof list)[0]) => b.r.score - a.r.score || a.s.name.localeCompare(b.s.name),
      "last-contact": (a: (typeof list)[0], b: (typeof list)[0]) => a.s.lastContact.localeCompare(b.s.lastContact),
    };
    return list.sort(sorters[props.sort as keyof typeof sorters] ?? sorters.name);
  }, [subject, requests, props.sort]);

  if (subject.kind !== "advisor") return <p className="vbg-meta">The roster is for advisors.</p>;

  const toggle = (id: string) => setRows(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  const approvePlans = () => {
    const ids = checked.filter((id) => subject.advisees.find((a) => a.id === id)?.planStatus === "submitted");
    store.set((s) => ({ planStatus: { ...s.planStatus, ...Object.fromEntries(ids.map((id) => [id, "approved" as const])) }, selectedRows: [] }));
    notify(`Approved ${ids.length} submitted ${ids.length === 1 ? "plan" : "plans"}`);
  };
  const remind = () => {
    notify(`Reminder sent to ${checked.length} ${checked.length === 1 ? "advisee" : "advisees"}`);
    setRows([]);
  };

  return (
    <div className="vbg-custom-stack-2" data-density={props.density ?? "comfortable"}>
      {multi && (
        <div className="vbg-custom-bulk" role="toolbar" aria-label="Bulk actions">
          <span className="vbg-meta">{checked.length ? `${checked.length} selected` : "Select advisees to act on several at once"}</span>
          <button type="button" className="vbg-custom-text-button" disabled={!checked.length} onClick={approvePlans}>
            Approve submitted plans
          </button>
          <button type="button" className="vbg-custom-text-button" disabled={!checked.length} onClick={remind}>
            Send reminder
          </button>
        </div>
      )}
      <div className="vbg-table-wrap vbg-custom-roster">
        <table>
          <caption className="vbg-visually-hidden">Advisees</caption>
          <thead>
            <tr>
              {multi && (
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={checked.length === rows.length}
                    onChange={() => setRows(checked.length === rows.length ? [] : rows.map((x) => x.s.id))}
                  />
                </th>
              )}
              <th scope="col">Name</th>
              {columns === "academic" && (
                <>
                  <th scope="col" className="vbg-numeric">Year</th>
                  <th scope="col" className="vbg-numeric">GPA</th>
                  <th scope="col" className="vbg-numeric">Credits earned</th>
                </>
              )}
              {columns === "risk" && (
                <>
                  <th scope="col">Flags</th>
                  <th scope="col" className="vbg-numeric">Planned credits</th>
                  <th scope="col" className="vbg-numeric">Days since contact</th>
                </>
              )}
              {columns === "enrollment" && (
                <>
                  <th scope="col">Plan</th>
                  <th scope="col" className="vbg-numeric">Planned credits</th>
                  <th scope="col" className="vbg-numeric">Pending overrides</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, r, credits, pending }) => (
              <motion.tr
                layout="position"
                key={s.id}
                aria-selected={selected === s.id}
                className="vbg-custom-clickable"
                onClick={() => selectStudent(s.id)}
              >
                {multi && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${s.name}`} checked={checked.includes(s.id)} onChange={() => toggle(s.id)} />
                  </td>
                )}
                <th scope="row">{s.name}</th>
                {columns === "academic" && (
                  <>
                    <td className="vbg-numeric">{s.year}</td>
                    <td className="vbg-numeric">{s.gpa.toFixed(2)}</td>
                    <td className="vbg-numeric">{creditsOf(s.completed)}</td>
                  </>
                )}
                {columns === "risk" && (
                  <>
                    <td data-state={r.score ? "error" : undefined}>{r.flags.join(", ") || <span className="vbg-meta">None</span>}</td>
                    <td className="vbg-numeric">{r.credits}</td>
                    <td className="vbg-numeric">{daysSince(s.lastContact)}</td>
                  </>
                )}
                {columns === "enrollment" && (
                  <>
                    <td>{STATUS[s.planStatus]}</td>
                    <td className="vbg-numeric">{credits}</td>
                    <td className="vbg-numeric">{pending || "–"}</td>
                  </>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
