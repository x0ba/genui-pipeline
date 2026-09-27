// Manual check: requests Jev should and should not flag as outside the spec, and
// for served requests, the view and filters it should pick.
import { personaById } from "../shared/personas";
import { serve } from "../server/jev";
import { DEFAULT_SPEC, getLibrary, getSpec } from "../server/store";

type Expect = { view?: string; props?: Record<string, Record<string, string>>; ownSpec?: boolean };
const cases: [string, string, boolean, Expect?][] = [
  ["maya", "Give me a list of the courses that have to do with science, technology, engineering, or math that are still open and don't have a waitlist", true],
  ["maya", "Only show courses that still have open seats", false, { view: "catalog", props: { results: { seats: "open" } } }],
  ["maya", "Give me a list of courses that are still available", false, { view: "catalog", props: { results: { seats: "open" } } }],
  ["maya", "Give me a list of courses that are after noon", false, { view: "catalog", props: { results: { timeFilter: "afternoon", seats: "any" } } }],
  ["maya", "What fits around my library shifts?", false],
  ["maya", "Show my week", false],
  ["maya", "What do I still need to graduate?", false],
  ["maya", "Show how prerequisites chain from what I've taken to the capstone", false],
  ["maya", "Which remaining requirement courses fit my week?", false],
  ["maya", "Show a histogram of grade distributions for every CS course I could take", true],
  ["sam", "Find an afternoon gen-ed", false, { view: "catalog", props: { results: { timeFilter: "afternoon", scope: "gen-ed", seats: "any" } } }],
  ["sam", "Show courses with the most open seats first", false, { view: "catalog", props: { results: { ranking: "open-seats", seats: "any" } } }],
  ["sam", "Only CS electives in the evening", false, { view: "catalog", props: { results: { timeFilter: "evening", scope: "cs-electives", seats: "any" } } }],
  ["sam", "Evening courses that still have seats", false, { view: "catalog", props: { results: { timeFilter: "evening", seats: "open" } } }],
  ["sam", "Which courses are full?", false],
  // Okafor is served from the shared default, which has no roster or override queue.
  ["okafor", "Who needs my attention before registration opens?", true],
  ["okafor", "Clear the pending override requests", true],
  ["okafor", "Which courses will my advisees get waitlisted in?", false],
  ["okafor", "Show a heatmap of when my advisees' planned classes meet across the week", true],
  // Okafor's own spec has a GPA chart whose ranges are one-point or half-point:
  // requests for other ranges must be flagged, not rounded to the nearest option.
  ["okafor", "give me a pie chart of the amount of people with gpa's from 0-1, 1-2, 2-3, and 3-4", false, { ownSpec: true, props: { "gpa-chart": { bins: "whole", markType: "pie" } } }],
  ["okafor", "give me a pie chart of the amount of people with gpa's from 0-2 and 2-4", true, { ownSpec: true }],
  ["okafor", "Pie chart of advisees above and below a 3.3 GPA", true, { ownSpec: true }],
  ["okafor", "Bar chart of advisee GPAs in half-point ranges", false, { ownSpec: true, props: { "gpa-chart": { bins: "half", markType: "bars" } } }],
  ["okafor", "Pie chart of my advisees' GPAs", false, { ownSpec: true, props: { "gpa-chart": { bins: "whole" } } }],
];
let wrong = 0;
for (const [id, request, expectGap, expect] of cases) {
  const p = personaById.get(id)!;
  const spec = id === "okafor" && !expect?.ownSpec ? DEFAULT_SPEC : getSpec(id);
  const d = await serve({ userId: id, spec, role: p.subject.kind, library: getLibrary(), request, context: { device: "desktop", phase: "planning" } });
  const misses = [
    ...(d.gap!.flagged !== expectGap ? [`gap ${d.gap!.flagged}`] : []),
    ...(expect?.view && d.view !== expect.view ? [`view ${d.view}`] : []),
    ...Object.entries(expect?.props ?? {}).flatMap(([slot, props]) =>
      Object.entries(props).flatMap(([k, v]) => (d.props[slot]?.[k] === v ? [] : [`${slot}.${k}=${d.props[slot]?.[k]}`])),
    ),
  ];
  if (misses.length) wrong++;
  console.log(
    `${misses.length ? "MISS" : "ok  "} ${id} gap=${d.gap!.probability.toFixed(2)} ${d.gap!.kind.padEnd(17)} ${d.view.padEnd(10)} ${request.slice(0, 70)}  ${JSON.stringify(d.props.results ?? d.props["gpa-chart"] ?? {})}${d.gap!.unmatched.length ? ` unmatched=${d.gap!.unmatched.map((u) => `${u.slotId}.${u.prop}`).join(",")}` : ""}${misses.length ? `  (${misses.join(", ")})` : ""}`,
  );
}
console.log(`\n${cases.length - wrong}/${cases.length} correct`);
