import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  courses,
  fmtMeeting,
  overlaps,
  requirementStatus,
  sections as allSections,
  timeOfDay,
  usePlan,
  useSelection,
  useSubject,
  type Course,
  type Section,
} from "@kit";

type Props = { props: Record<string, string> };
type Result = { course: Course; sections: Section[]; fit: number; open: number; group: string };

const REQUIREMENT_LABEL: Record<string, string> = {
  "cs-core": "Computer science core",
  "math-core": "Mathematics and statistics",
  "cs-elective": "Computer science electives",
  capstone: "Senior capstone",
  "gen-ed": "General education",
};
const TIME_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export default function CourseSearch({ props }: Props) {
  const subject = useSubject();
  const plan = usePlan();
  const { course: selected, selectCourse } = useSelection();
  const [text, setText] = useState("");
  const student = subject.kind === "student" ? subject.student : null;

  const results = useMemo(() => {
    const unmet = new Set(student ? requirementStatus(student).flatMap((r) => (r.done.length + r.planned.length < r.needed ? r.remaining : [])) : []);
    // Time already taken, not counting the course's own planned section.
    const busyFor = (code: string) =>
      student ? [...student.blocked, ...plan.sections.filter((s) => s.course !== code).map((s) => s.meeting)] : [];
    const q = text.trim().toLowerCase();
    const out: Result[] = [];
    for (const course of courses) {
      if (student?.completed.includes(course.code)) continue;
      if (props.scope === "remaining" && student && !unmet.has(course.code)) continue;
      if (props.scope === "gen-ed" && !course.attributes.includes("gen-ed")) continue;
      if (props.scope === "cs-electives" && !course.attributes.includes("cs-elective")) continue;
      if (q && !`${course.code} ${course.title} ${course.description}`.toLowerCase().includes(q)) continue;
      const busy = busyFor(course.code);
      const secs = allSections.filter((s) => {
        if (s.course !== course.code) return false;
        if (props.seats === "open" && s.enrolled >= s.capacity) return false;
        if (props.timeFilter === "fits-schedule") return !busy.some((m) => overlaps(s.meeting, m));
        if (props.timeFilter && props.timeFilter !== "any") return timeOfDay(s.meeting) === props.timeFilter;
        return true;
      });
      if (!secs.length) continue;
      const open = Math.max(...secs.map((s) => s.capacity - s.enrolled));
      const fits = secs.some((s) => !busy.some((m) => overlaps(s.meeting, m)));
      const fit = (unmet.has(course.code) ? 3 : 0) + (fits ? 2 : 0) + (open > 0 ? 1 : 0) + course.rating / 5;
      const group =
        props.grouping === "department"
          ? course.dept
          : props.grouping === "requirement"
            ? REQUIREMENT_LABEL[course.attributes[0]]
            : props.grouping === "time-of-day"
              ? TIME_LABEL[timeOfDay(secs[0].meeting)]
              : "";
      out.push({ course, sections: secs, fit, open, group });
    }
    const rank: Record<string, (a: Result, b: Result) => number> = {
      code: (a, b) => a.course.code.localeCompare(b.course.code, undefined, { numeric: true }),
      rating: (a, b) => b.course.rating - a.course.rating,
      "open-seats": (a, b) => b.open - a.open,
      fit: (a, b) => b.fit - a.fit,
    };
    return out.sort(rank[props.ranking] ?? rank.code);
  }, [student, plan.sections, text, props.scope, props.timeFilter, props.seats, props.ranking, props.grouping]);

  const groups = useMemo(() => {
    const map = new Map<string, Result[]>();
    for (const r of results) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map.entries()];
  }, [results]);

  const representation = props.representation ?? "list";

  return (
    <div className="vbg-custom-search">
      <div className="vbg-field vbg-custom-search-field">
        <label className="vbg-visually-hidden" htmlFor="course-query">
          Search courses
        </label>
        <input id="course-query" type="search" placeholder="Search by code, title or topic" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <p className="vbg-meta" aria-live="polite">
        {results.length} {results.length === 1 ? "course" : "courses"}
        {props.timeFilter && props.timeFilter !== "any" ? `, ${props.timeFilter === "fits-schedule" ? "sections that fit your week" : `${props.timeFilter} sections`}` : ""}
        {props.seats === "open" ? ", open seats only" : ""}
      </p>
      {groups.map(([group, items]) => (
        <section key={group || "all"} className="vbg-custom-result-group">
          {group && <h3 className="vbg-heading-16">{group}</h3>}
          {representation === "table" ? (
            <div className="vbg-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Title</th>
                    <th scope="col">First matching section</th>
                    <th scope="col" className="vbg-numeric">Open seats</th>
                    <th scope="col" className="vbg-numeric">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <motion.tr
                      layout="position"
                      key={r.course.code}
                      aria-selected={selected?.code === r.course.code}
                      className="vbg-custom-clickable"
                      onClick={() => selectCourse(r.course.code)}
                    >
                      <th scope="row">{r.course.code}</th>
                      <td>{r.course.title}</td>
                      <td>{fmtMeeting(r.sections[0].meeting)}</td>
                      <td className="vbg-numeric">{r.open > 0 ? r.open : "Full"}</td>
                      <td className="vbg-numeric">{r.course.rating.toFixed(1)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className={representation === "cards" ? "vbg-custom-cards" : "vbg-custom-rows"}>
              {items.slice(0, 40).map((r) => (
                <motion.li layout key={r.course.code} layoutId={`course-${r.course.code}`} transition={{ type: "spring", stiffness: 420, damping: 40 }}>
                  <button
                    type="button"
                    className="vbg-custom-result"
                    aria-current={selected?.code === r.course.code}
                    onClick={() => selectCourse(r.course.code)}
                  >
                    <span className="vbg-custom-result-code">{r.course.code}</span>
                    <span className="vbg-custom-result-title">{r.course.title}</span>
                    {representation === "cards" && <span className="vbg-custom-result-desc">{r.course.description}</span>}
                    <span className="vbg-custom-result-meta">
                      {fmtMeeting(r.sections[0].meeting)}
                      {r.sections.length > 1 ? ` and ${r.sections.length - 1} more` : ""}
                    </span>
                    <span className="vbg-custom-result-seats" data-state={r.open > 0 ? undefined : "warning"}>
                      {r.open > 0 ? `${r.open} open` : `Full, waitlist ${Math.max(...r.sections.map((s) => s.waitlist))}`}
                      {representation === "cards" ? ` · rated ${r.course.rating.toFixed(1)}` : ""}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {results.length === 0 && <p>No courses match. Try another filter or search.</p>}
    </div>
  );
}
