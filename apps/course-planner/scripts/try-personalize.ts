// Manual check: run the builder's personalize step for one persona, skipping the gate.
// Runs Claude, so it costs money.
//   bun run scripts/try-personalize.ts [user=maya]
import { malleable } from "../server/malleable";
import { watchRun } from "./watch-run";

const userId = process.argv[2] ?? "maya";
const done = watchRun(userId);
const { gate, runId } = await malleable.personalize(userId, "dashboard", true);
console.log(`gate: fits=${gate.defaultFits.toFixed(2)} personalize=${gate.personalize}  run ${runId}`);
process.exit((await done) ? 0 : 1);
