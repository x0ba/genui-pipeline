import { motion } from "motion/react";
import { useMemo } from "react";
import {
  courses,
  fmtMeeting,
  plural,
  sections as allSections,
  useSelection,
  useSubject,
  type Course,
  type Section,
} from "@kit";

type Props = Record<string, string>;

const STEM_DEPTS = new Set([
  "CS", "CSE", "CIS", "COMP", "DATA", "DS", "INFO", "MATH", "STAT", "STATS", "PHYS", "CHEM", "BIO", "BIOL", "BIOS",
  "ENGR", "ENG", "ECE", "EE", "ME", "CE", "BME", "CHE", "ASTR", "GEOL", "GEO", "EES", "ENVS", "NEUR", "NEURO",
]);

const NOON = 12 * 60;
const FIVE = 17 * 60;

function deptOf(c: Course): string {
  return String(c.dept || c.code.split(" ")[0] || "").toUpperCase();
}

function isStem(c: Course): boolean {
  return STEM_DEPTS.has(deptOf(c));
}

function timeOk(s: Section, t: string): boolean {
  const start = s.meeting.start;
  if (t === "morning") return start < NOON;
  if (t === "after-noon") return start >= NOON;
  if (t === "evening") return start >= FIVE;
  return true;
}

type Row = { course: Course; secs: Section[]; open: number };

export default function CourseFieldTimeFinder(props: Props) {
  const subject = useSubject();
  const { course: selected, selectCourse } = useSelection();
  const field = props.field ?? "any";
  const startTime = props.startTime ?? "any";
  const seats = props.seats ?? "any";
  const student = subject.kind === "student" ? subject.student : null;

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const course of courses) {
      if (student && student.completed.includes(course.code)) continue;
      if (field === "stem" && !isStem(course)) continue;
      if (field === "non-stem" && isStem(course)) continue;
      const secs = allSections
        .filter((s) => s.course === course.code)
        .filter((s) => timeOk(s, startTime))
        .filter((s) => seats !== "open" || s.enrolled < s.capacity)
        .sort((a, b) => a.meeting.start - b.meeting.start);
      if (!secs.length) continue;
      const open = secs.reduce((n, s) => n + Math.max(0, s.capacity - s.enrolled), 0);
      out.push({ course, secs, open });
    }
    return out.sort((a, b) => a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
  }, [student, field, startTime, seats]);

  const fieldText = field === "stem" ? "STEM " : field === "non-stem" ? "non-STEM " : "";
  const timeText =
    startTime === "morning"
      ? " with sections starting before noon"
      : startTime === "after-noon"
        ? " with sections starting at noon or later"
        : startTime === "evening"
          ? " with sections starting at 5pm or later"
          : "";
  const seatText = seats === "open" ? ", open seats only" : "";
  const depts = [...new Set(rows.map((r) => deptOf(r.course)))].sort();

  return (
    <div className="vbg-custom-stack-4">
      <p className="vbg-meta" aria-live="polite">
        {plural(rows.length, `${fieldText}course`)}
        {timeText}
        {seatText}
        {student ? ", not counting courses already completed" : ""}
        {depts.length ? `. Departments: ${depts.join(", ")}.` : "."}
      </p>
      {rows.length === 0 ? (
        <p>No courses match these filters this term.</p>
      ) : (
        <div className="vbg-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Title</th>
                <th scope="col">Matching sections</th>
                <th scope="col" className="vbg-numeric">Open seats</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <motion.tr layout="position" key={r.course.code} aria-selected={selected?.code === r.course.code}>
                  <th scope="row">
                    <button type="button" className="vbg-custom-text-button" onClick={() => selectCourse(r.course.code)}>
                      {r.course.code}
                    </button>
                  </th>
                  <td>
                    {r.course.title}
                    <br />
                    <span className="vbg-meta">{isStem(r.course) ? "STEM" : "Non-STEM"} · {plural(Number(r.course.credits), "credit")}</span>
                  </td>
                  <td>
                    {r.secs.map((s) => (
                      <div key={s.id}>
                        {fmtMeeting(s.meeting)}
                        {s.enrolled >= s.capacity ? (
                          <span data-state="warning"> full{s.waitlist ? `, waitlist ${s.waitlist}` : ""}</span>
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td className="vbg-numeric">{r.open > 0 ? r.open : <span data-state="warning">Full</span>}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="vbg-caption">
        STEM means computer science, mathematics, statistics, the natural sciences and engineering, judged by department. Select a course code to open its details.
      </p>
    </div>
  );
}
