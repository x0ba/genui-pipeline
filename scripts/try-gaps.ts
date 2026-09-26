// Manual check: requests Jev should and should not flag as outside the spec.
import { personaById } from "../shared/personas";
import { serve } from "../server/jev";
import { getLibrary, getSpec } from "../server/store";

const cases: [string, string, boolean][] = [
  ["maya", "Give me a list of the courses that have to do with science, technology, engineering, or math that are still open and don't have a waitlist", true],
  ["maya", "Only show courses that still have open seats", true],
  ["maya", "What fits around my library shifts?", false],
  ["maya", "Show my week", false],
  ["maya", "What do I still need to graduate?", false],
  ["maya", "Show how prerequisites chain from what I've taken to the capstone", false],
  ["maya", "Which remaining requirement courses fit my week?", false],
  ["maya", "Show a histogram of grade distributions for every CS course I could take", true],
  ["sam", "Find an afternoon gen-ed", false],
  ["sam", "Show courses with the most open seats first", false],
  ["sam", "Only CS electives in the evening", false],
  ["sam", "Which courses are full?", false],
  // Okafor is on the shared default, which has no roster or override queue.
  ["okafor", "Who needs my attention before registration opens?", true],
  ["okafor", "Clear the pending override requests", true],
  ["okafor", "Which courses will my advisees get waitlisted in?", false],
  ["okafor", "Show a heatmap of when my advisees' planned classes meet across the week", true],
];
let wrong = 0;
for (const [id, request, expect] of cases) {
  const p = personaById.get(id)!;
  const d = await serve({ userId: id, spec: getSpec(id), role: p.subject.kind, library: getLibrary(), request, context: { device: "desktop", phase: "planning" } });
  const ok = d.gap!.flagged === expect;
  if (!ok) wrong++;
  console.log(`${ok ? "ok  " : "MISS"} ${id} gap=${d.gap!.probability.toFixed(2)} ${d.gap!.kind.padEnd(17)} ${d.view.padEnd(10)} ${request.slice(0, 70)}  ${JSON.stringify(d.props.results ?? {})}`);
}
console.log(`\n${cases.length - wrong}/${cases.length} correct`);
