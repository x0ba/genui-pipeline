// Manual check: run the Claude extension agent for one persona and request.
import { personaById } from "../shared/personas";
import { extend } from "../server/claude/agents";
import { subscribe } from "../server/events";

const persona = personaById.get(process.argv[2] ?? "maya")!;
const request = process.argv[3] ?? "Show how prerequisites chain from what I've taken to the capstone";
subscribe((e) => {
  if (e.type === "claude.tool") console.log("tool", e.name, e.input.slice(0, 160));
  else if (e.type === "claude.result") console.log("  ->", e.ok ? "ok" : "ERR", e.summary.slice(0, 600));
  else if (e.type === "claude.text") console.log("text", e.text.slice(0, 400));
  else console.log(e.type, JSON.stringify(e).slice(0, 300));
});
console.log(await extend(persona, request, process.argv[4] ?? "new-visualization"));
