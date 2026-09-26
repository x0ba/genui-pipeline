// Manual check: the Jev gate for every persona, then a few serving requests.
import { PERSONAS, personaById } from "../shared/personas";
import { gate, serve } from "../server/jev";
import { DEFAULT_SPEC, getLibrary, getSpec } from "../server/store";

const library = getLibrary();
for (const p of PERSONAS) {
  const g = await gate(p, DEFAULT_SPEC, library);
  console.log(`gate ${p.id}: fits=${g.defaultFits.toFixed(2)} spec=${g.specialization.score.toFixed(2)} personalize=${g.personalize} ${g.latencyMs}ms $${g.costUsd.toFixed(6)}`);
}
const requests: [string, string][] = [
  ["maya", ""],
  ["maya", "What fits around my library shifts?"],
  ["maya", "What do I still need to graduate?"],
  ["maya", "Show a histogram of grade distributions for every CS course I could take"],
  ["okafor", "Who needs my attention before registration opens?"],
  ["okafor", "Clear the pending override requests"],
  ["okafor", "Show a heatmap of when my advisees' planned classes meet across the week"],
  ["sam", "Find an afternoon gen-ed"],
];
for (const [id, request] of requests) {
  const p = personaById.get(id)!;
  const d = await serve({ userId: id, spec: getSpec(id), role: p.subject.kind, library, request, context: { device: "desktop", phase: "planning" } });
  console.log(`\n${id} "${request}" -> ${d.view} (${d.viewConfidence.toFixed(2)}) layout=${d.layout} gap=${d.gap?.probability.toFixed(2)} ${d.gap?.flagged ? "FLAGGED " + d.gap.kind : ""} ${d.latencyMs}ms ${d.questionCount}q ${d.inputTokens}tok`);
  console.log("   ", JSON.stringify(d.props));
}
