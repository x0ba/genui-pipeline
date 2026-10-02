// Manual check: serve one request and, if the decider flags it, run the builder's
// extend step on it. Runs Claude, so it costs money.
//   bun run scripts/try-extend.ts [user=maya] [request]
import { malleable } from "../server/malleable";
import { watchRun } from "./watch-run";

const userId = process.argv[2] ?? "maya";
const request = process.argv[3] ?? "Show how prerequisites chain from what I've taken to the capstone";
const d = await malleable.serve(userId, { region: "dashboard", request, context: { device: "desktop", registration_phase: "planning" } });
console.log(`served ${d.view}: gap ${d.gap?.flagged ? `flagged (${d.gap.kind}, ${d.gap.probability.toFixed(2)})` : "not flagged"}`);
if (!d.gap?.flagged) process.exit(0);
const done = watchRun(userId);
const { runId } = await malleable.extend(userId, d.id);
console.log(`run ${runId}`);
process.exit((await done) ? 0 : 1);
