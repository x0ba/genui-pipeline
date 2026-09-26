# Component kit

Every component in the course planner, built-in or generated, is one TSX module.

## Module contract

```tsx
import { motion } from "motion/react";        // optional
import { useMemo, useState } from "react";
import { useSubject, courses, fmtMeeting } from "@kit";

type Props = { props: Record<string, string> };

export default function PrereqGraph({ props }: Props) {
  // props holds one option key for every prop you declared, e.g. props.layout === "left-to-right"
}
```

- Only `react`, `motion/react` and `@kit` may be imported. No network, storage, cookies or `eval`.
- `export default` a function component. It receives `{ props }` and nothing else.
- Honour every declared prop: each option must visibly change the output.
- The shell already draws the slot's title from the component definition. Do not render your own top-level heading; start with content. Sub-headings use `className="vbg-heading-16"`.
- Must render meaningful text on the server (it is validated with `renderToString`): no `window`/`document` access during render; put measurement in `useEffect` if you need it.
- Keep it deterministic. Compute from data; do not hard-code a particular student's values.

## Data (`@kit`)

Hooks (use inside the component):

| Hook | Returns |
| --- | --- |
| `useSubject()` | `{ kind: "student", id, student }` or `{ kind: "advisor", id, advisor, advisees: Student[] }`. Student records include this session's plan edits. Branch on `kind` and handle both if your `roles` include both. |
| `useStudent(id)` | One `Student` (with live plan) or `null`. |
| `usePlan(studentId?)` | `{ sections: Section[], status, add(sectionId), remove(sectionId), submit() }` for the subject student by default. |
| `useSelection()` | `{ course: Course \| null, student: string \| null, selectCourse(code), selectStudent(id), rows, setRows(ids) }`. Selecting a course or student updates detail panes elsewhere in the view. |
| `useOverrides()` | `{ requests: OverrideRequest[], decide(id \| ids, "approved" \| "denied") }`, scoped to the subject. |
| `useNotify()` | `(text) => void`, a short confirmation line. |

Static data and pure helpers:

- `courses: Course[]`, `courseByCode: Map`, `sections: Section[]`, `sectionById: Map`, `students: Student[]`, `studentById: Map`, `programs`, `TERM` (`{ name, registrationOpens, addDropEnds, today }`), `DAYS` (`["M","T","W","R","F"]`), `DAY_NAMES`.
- `requirementStatus(student)` → per requirement `{ id, title, courses, needed, done[], planned[], remaining[] }`.
- `missingPrereqs(student, code)` → prerequisite codes not completed.
- `scheduleConflicts(student, sections?)` → `{ a, b, label }[]`; `overlaps(meetingA, meetingB)`.
- `risk(student)` → `{ credits, remainingCourses, termsLeft, flags: string[], score }`.
- `creditsOf(codes)`, `plannedSections(student)`, `timeOfDay(meeting)`.
- Formatting: `fmtTime(minutes)`, `fmtMeeting(meeting)`, `fmtPct(0..1)`, `plural(n, word)`.
- `scaleLinear([d0, d1], [r0, r1])` for SVG geometry.

Types:

```ts
Course  { code: "CS 220", title, dept, level, credits, description, prereqs: string[], attributes: ("cs-core"|"cs-elective"|"math-core"|"capstone"|"gen-ed")[], rating, grades: {A,B,C,D,F} }
Section { id: "CS220-01", course: "CS 220", number, instructor, meeting: { days: ("M"|"T"|"W"|"R"|"F")[], start, end }, room, modality, capacity, enrolled, waitlist }   // start/end are minutes after midnight
Student { id, name, year: 1-4, program, gpa, completed: string[] (course codes), planned: string[] (section ids), planStatus, holds: {kind, note}[], blocked: (Meeting & {label})[], advisor, lastContact: "YYYY-MM-DD" }
OverrideRequest { id, student, course, kind: "prerequisite"|"capacity"|"credit-overload", reason, submitted, status }
```

## Design rules

The app follows Vercel's design guidance, using the published `vercel-brand.css` foundation.

- Monochrome first. Colour only for meaning, always paired with text: set `data-state="error"` or `data-state="warning"` on an element to colour it; never colour to decorate.
- Typography is Geist. Use the published roles: `vbg-heading-16` for sub-headings, `vbg-meta` for secondary lines, `vbg-caption` for chart captions, `vbg-numeric` for right-aligned tabular numbers. Never set arbitrary font sizes or weights.
- Tables: semantic `<table>` inside `<div className="vbg-table-wrap">`, `<th scope>`, numeric headers and cells both get `className="vbg-numeric"`.
- Charts: `<figure className="vbg-chart">` with an inline `<svg>` and a `<figcaption className="vbg-caption">` stating what to notice. Direct labels beat legends. Series colours: `var(--vbg-chart-1)` … `var(--vbg-chart-6)`; neutral marks use `currentColor` or `var(--vbg-text-secondary)`; rules use `var(--vbg-border-default)`. Put SVG `<text>` in `fill="currentColor"` with `className="vbg-meta"` or `vbg-caption`-sized text. Give the SVG `role="img"` and an `aria-label`, or pair it with a visually hidden table (`className="vbg-visually-hidden"`).
- Spacing tokens: `var(--vbg-space-1)` … `var(--vbg-space-16)`. Radii: `var(--vbg-radius-small)`, `var(--vbg-radius)`. Surfaces: `var(--vbg-surface-primary)`, `var(--vbg-surface-secondary)`. Text: `var(--vbg-text-primary)`, `var(--vbg-text-secondary)`. Borders: `var(--vbg-border-subtle|default|strong)`.
- Layout helpers you may use: `vbg-custom-stack-2`, `vbg-custom-stack-4`, `vbg-custom-stack-6` (vertical rhythm), `vbg-custom-actions` (a row of buttons), `vbg-custom-text-button` (quiet text button), `vbg-button` (primary button), `vbg-custom-plain` (unstyled list). Inline `style` is fine for geometry.
- No gradients, glows, shadows, pills, badges, icon tiles, emoji or decorative borders. No cards inside cards. Both light and dark themes must work, so only use the tokens above, never raw hex colours.
- Motion: `motion.*` elements with `layout` so state changes animate into place. No decorative or looping animation.
- Must fit the slot's width (it may be a narrow side column or a phone). Give SVG a `viewBox`, `width="100%"` and `style={{ maxWidth: naturalWidth }}` so it shrinks to fit but never scales text above its natural size. Allow horizontal scroll only for wide tables or diagrams (`style={{ overflowX: "auto" }}`).
