import { motion } from "motion/react";
import { useMemo } from "react";
import { creditsOf, risk, scheduleConflicts, TERM, useNotify, useOverrides, useSelection, useSubject } from "@kit";

type Props = Record<string, string>;

const daysSince = (date: string) => Math.round((Date.parse(TERM.today) - Date.parse(date)) / 86_400_000);
const STATUS: Record<string, string> = { "not-started": "Not started", draft: "Draft", submitted: "Submitted", approved: "Approved" };

export default function AdviseeFullRoster(props: Props) {
  const subject = useSubject();
  const { student: selected, selectStudent, rows: checked, setRows } = useSelection();
  const { requests } = useOverrides();
  const notify = useNotify();
  const density = props.density ?? "compact";
  const sort = props.sort ?? "name";
  const filter = props.rows ?? "all";
  const compact = density === "compact";

  const rows = useMemo(() => {
    if (subject.kind !== "advisor") return [];
    const list = subject.advisees.map((s) => {
      const r = risk(s);
      return {
        s,
        r,
        earned: creditsOf(s.completed),
        conflicts: scheduleConflicts(s).length,
        pending: requests.filter((o) => o.student === s.id && o.status === "pending").length,
        days: daysSince(s.lastContact),
      };
    });
    type Row = (typeof list)[0];
    const filters: Record<string, (x: Row) => boolean> = {
      all: () => true,
      flagged: (x) => x.r.flags.length > 0,
      "under-12": (x) => x.r.credits < 12,
      holds: (x) => x.s.holds.length > 0,
    };
    const byName = (a: Row, b: Row) => a.s.name.localeCompare(b.s.name);
    const sorters: Record<string, (a: Row, b: Row) => number> = {
      name: byName,
      risk: (a, b) => b.r.score - a.r.score || b.r.flags.length - a.r.flags.length || byName(a, b),
      gpa: (a, b) => a.s.gpa - b.s.gpa || byName(a, b),
      "last-contact": (a, b) => b.days - a.days || byName(a, b),
    };
    return list.filter(filters[filter] ?? filters.all).sort(sorters[sort] ?? byName);
  }, [subject, requests, sort, filter]);

  if (subject.kind !== "advisor") return <p className="vbg-meta">The roster is for advisors.</p>;

  const total = subject.advisees.length;
  const allChecked = rows.length > 0 && rows.every((x) => checked.includes(x.s.id));
  const toggle = (id: string) => setRows(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  const remind = () => {
    notify(`Reminder sent to ${checked.length} ${checked.length === 1 ? "advisee" : "advisees"}`);
    setRows([]);
  };
  const avg = (f: (x: (typeof rows)[0]) => number) => (rows.length ? rows.reduce((n, x) => n + f(x), 0) / rows.length : 0);
  const flaggedCount = rows.filter((x) => x.r.flags.length).length;
  const pendingTotal = rows.reduce((n, x) => n + x.pending, 0);
  const cell = compact ? { whiteSpace: "nowrap" as const } : undefined;

  return (
    <div className="vbg-custom-stack-2" data-density={density}>
      <div className="vbg-custom-bulk" role="toolbar" aria-label="Bulk actions">
        <span className="vbg-meta">
          {rows.length === total ? `${total} advisees` : `${rows.length} of ${total} advisees`}
          {checked.length ? ` · ${checked.length} selected` : ""}
        </span>
        <button type="button" className="vbg-custom-text-button" disabled={!checked.length} onClick={remind}>
          Send reminder
        </button>
      </div>
      <div className="vbg-table-wrap vbg-custom-roster" style={{ overflowX: "auto" }}>
        <table>
          <caption className="vbg-visually-hidden">All advisees and their information</caption>
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={allChecked}
                  onChange={() => setRows(allChecked ? [] : rows.map((x) => x.s.id))}
                />
              </th>
              <th scope="col">Name</th>
              {compact && <th scope="col">Program</th>}
              <th scope="col" className="vbg-numeric">Year</th>
              <th scope="col" className="vbg-numeric">GPA</th>
              <th scope="col" className="vbg-numeric">Earned cr</th>
              <th scope="col" className="vbg-numeric">Planned cr</th>
              <th scope="col">Plan</th>
              <th scope="col" className="vbg-numeric">Courses left</th>
              <th scope="col" className="vbg-numeric">Terms left</th>
              <th scope="col" className="vbg-numeric">Holds</th>
              <th scope="col" className="vbg-numeric">Conflicts</th>
              <th scope="col">Flags</th>
              <th scope="col" className="vbg-numeric">Overrides</th>
              <th scope="col" className="vbg-numeric">Days since contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, r, earned, conflicts, pending, days }) => (
              <motion.tr
                layout="position"
                transition={{ type: "spring", stiffness: 500, damping: 45 }}
                key={s.id}
                aria-selected={selected === s.id}
                className="vbg-custom-clickable"
                onClick={() => selectStudent(s.id)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${s.name}`} checked={checked.includes(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <th scope="row" style={cell}>
                  {compact ? (
                    s.name
                  ) : (
                    <div className="vbg-custom-stack-2">
                      <span>{s.name}</span>
                      <span className="vbg-meta">{s.program}</span>
                    </div>
                  )}
                </th>
                {compact && <td style={cell}>{s.program}</td>}
                <td className="vbg-numeric">{s.year}</td>
                <td className="vbg-numeric" data-state={s.gpa < 2.3 ? "error" : undefined}>{s.gpa.toFixed(2)}</td>
                <td className="vbg-numeric">{earned}</td>
                <td className="vbg-numeric" data-state={r.credits < 12 ? "warning" : undefined}>{r.credits}</td>
                <td style={cell}>{STATUS[s.planStatus] ?? s.planStatus}</td>
                <td className="vbg-numeric">{r.remainingCourses}</td>
                <td className="vbg-numeric">{r.termsLeft}</td>
                <td className="vbg-numeric" data-state={s.holds.length ? "error" : undefined} title={s.holds.map((h) => `${h.kind}: ${h.note}`).join("; ")}>
                  {s.holds.length || "–"}
                </td>
                <td className="vbg-numeric" data-state={conflicts ? "warning" : undefined}>{conflicts || "–"}</td>
                <td style={cell} data-state={r.flags.length ? "error" : undefined}>
                  {r.flags.length ? r.flags.join(compact ? "; " : ", ") : <span className="vbg-meta">None</span>}
                </td>
                <td className="vbg-numeric">{pending || "–"}</td>
                <td className="vbg-numeric">{days}</td>
              </motion.tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={compact ? 15 : 14} className="vbg-meta">No advisees match.</td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <th scope="row">{plural(rows.length)}</th>
                {compact && <td />}
                <td />
                <td className="vbg-numeric">{avg((x) => x.s.gpa).toFixed(2)}</td>
                <td className="vbg-numeric">{Math.round(avg((x) => x.earned))}</td>
                <td className="vbg-numeric">{avg((x) => x.r.credits).toFixed(1)}</td>
                <td />
                <td className="vbg-numeric">{avg((x) => x.r.remainingCourses).toFixed(1)}</td>
                <td />
                <td className="vbg-numeric">{rows.filter((x) => x.s.holds.length).length}</td>
                <td className="vbg-numeric">{rows.filter((x) => x.conflicts).length}</td>
                <td className="vbg-meta">{flaggedCount} flagged</td>
                <td className="vbg-numeric">{pendingTotal}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="vbg-caption">Footer shows averages for GPA, credits and courses left, and counts for holds, conflicts, flags and overrides.</p>
    </div>
  );
}

function plural(n: number) {
  return `${n} ${n === 1 ? "advisee" : "advisees"}`;
}
