# Component kit

Every component in the course planner, built-in or generated, is one TSX module.

## Module contract

```tsx
import { motion } from "motion/react";        // optional
import { useMemo, useState } from "react";
import { useSubject, courses, fmtMeeting } from "@kit";

type Props = { layout: string; density: string };

export default function PrereqGraph({ layout, density }: Props) {
  // each declared prop arrives as its own field, e.g. layout === "left-to-right"
}
```

- Only `react`, `motion/react` and `@kit` may be imported. No network, storage, cookies, `window`, `document` or `eval`.
- `export default` a function component. It receives one field per declared prop and nothing else. A `choice` prop receives the option key; a `param` prop receives the option's value.
- Honour every declared prop: each option must visibly change the output.
- The shell already draws the slot's title from the component definition. Do not render your own top-level heading; start with content. Sub-headings use `className="vbg-heading-16"`.
- Must render meaningful text on the server (it is validated with `renderToString`). Put measurement in `useEffect` and read elements through refs.
- Keep it deterministic. Compute from data; do not hard-code a particular student's values.

## Data (`@kit`)

Hooks (use inside the component):

| Hook | Returns |
| --- | --- |
| `useSubject()` | `{ kind: "student", id, student }` or `{ kind: "advisor", id, advisor, advisees: Student[] }`. Student records include this session's plan edits. Branch on `kind` and handle both if your `audiences` include both. |
| `useStudent(id)` | One `Student` (with live plan) or `null`. |
| `usePlan(studentId?)` | `{ sections: Section[], status, add(sectionId), remove(sectionId), submit() }` for the subject student by default. |
| `useSelection()` | `{ course: Course \| null, student: string \| null, selectCourse(code), selectStudent(id), rows, setRows(ids) }`. Selecting a course or student updates detail panes elsewhere in the view. |
| `useOverrides()` | `{ requests: OverrideRequest[], decide(id \| ids, "approved" \| "denied") }`, scoped to the subject. |
| `useNotify()` | `(text) => void`, a short confirmation line. |

`add`, `remove`, `submit` and `decide` change the person's data, so they only run in response to a click or key press. Call them from an event handler, never during render or from an effect; otherwise they throw.

Static data and pure helpers:

- `courses: Course[]`, `courseByCode: Map`, `sections: Section[]`, `sectionById: Map`, `students: Student[]`, `studentById: Map`, `programs`, `TERM` (`{ name, registrationOpens, addDropEnds, today }`), `DAYS` (`["M","T","W","R","F"]`), `DAY_NAMES`.
- `requirementStatus(student)` → per requirement `{ id, title, courses, needed, done[], planned[], remaining[] }`.
- `missingPrereqs(student, code)` → prerequisite codes not completed.
- `scheduleConflicts(student, sections?)` → `{ a, b, label }[]`; `overlaps(meetingA, meetingB)`.
- `risk(student)` → `{ credits, remainingCourses, termsLeft, flags: string[], score }`.
- `creditsOf(codes)`, `plannedSections(student)`, `timeOfDay(meeting)`.
- Motion: `move` (the default spring), `enter`, `exit`, `instant`, `easeOut`, and `collapse` (spread on a `motion.*` row inside `AnimatePresence`). See the design rules.
- Formatting: `fmtTime(minutes)`, `fmtMeeting(meeting)`, `fmtPct(0..1)`, `plural(n, word)`.
- `scaleLinear([d0, d1], [r0, r1])` for SVG geometry.
- `heat(t)` (0..1) → `{ step, fill, ink }`: a colour on the sequential ramp for heatmaps and filled cells, and the text colour that stays legible on it. See the design rules' Contrast section.

Types:

```ts
Course  { code: "CS 220", title, dept, level, credits, description, prereqs: string[], attributes: ("cs-core"|"cs-elective"|"math-core"|"capstone"|"gen-ed")[], rating, grades: {A,B,C,D,F} }
Section { id: "CS220-01", course: "CS 220", number, instructor, meeting: { days: ("M"|"T"|"W"|"R"|"F")[], start, end }, room, modality, capacity, enrolled, waitlist }   // start/end are minutes after midnight
Student { id, name, year: 1-4, program, gpa, completed: string[] (course codes), planned: string[] (section ids), planStatus, holds: {kind, note}[], blocked: (Meeting & {label})[], advisor, lastContact: "YYYY-MM-DD" }
OverrideRequest { id, student, course, kind: "prerequisite"|"capacity"|"credit-overload", reason, submitted, status }
```
