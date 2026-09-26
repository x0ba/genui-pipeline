// Manual check: run the Claude spec builder for one persona without the Jev gate.
import { personaById } from "../shared/personas";
import { personalize } from "../server/claude/agents";
import { subscribe } from "../server/events";

const persona = personaById.get(process.argv[2] ?? "maya")!;
subscribe((e) => {
  if (e.type === "claude.tool") console.log("tool", e.name, e.input.slice(0, 200));
  else if (e.type === "claude.result") console.log("  ->", e.ok ? "ok" : "ERR", e.summary.slice(0, 300));
  else if (e.type === "claude.text") console.log("text", e.text.slice(0, 300));
  else console.log(e.type, JSON.stringify(e).slice(0, 300));
});
const result = await personalize(persona);
console.log(result);
