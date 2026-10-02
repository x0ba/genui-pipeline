// Manual check: the gate for every persona, then a few serving requests. Decider only.
import { PERSONAS } from "../shared/personas";
import { malleable } from "../server/malleable";

for (const p of PERSONAS) {
  const g = await malleable.gate(p.id, "dashboard");
  console.log(
    `gate ${p.id}: fits=${g.defaultFits.toFixed(2)} spec=${g.specialization.score.toFixed(2)} personalize=${g.personalize} ${g.latencyMs}ms $${g.costUsd.toFixed(6)}`,
  );
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
  const d = await malleable.serve(id, { region: "dashboard", request, context: { device: "desktop", registration_phase: "planning" } });
  console.log(
    `\n${id} "${request}" -> ${d.view} (${d.viewConfidence.toFixed(2)}) layout=${d.layout} gap=${d.gap?.probability.toFixed(2)} ${d.gap?.flagged ? "FLAGGED " + d.gap.kind : ""} ${d.latencyMs}ms ${d.questionCount}q ${d.inputTokens}tok`,
  );
  console.log("   ", JSON.stringify(d.props));
}
