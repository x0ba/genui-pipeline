import type { MalleableEvent } from "@malleable/core";
import { malleable } from "../server/malleable";

/** Prints one person's builder events until the run ends. Resolves to whether it succeeded. */
export function watchRun(userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const stop = malleable.events.subscribe((e: MalleableEvent) => {
      if (e.userId !== userId) return;
      if (e.type === "builder.tool") console.log("tool", e.name, e.input.slice(0, 200));
      else if (e.type === "builder.result") console.log("  ->", e.ok ? "ok" : "ERR", e.summary.slice(0, 600));
      else if (e.type === "builder.text") console.log("text", e.text.slice(0, 400));
      else console.log(e.type, JSON.stringify(e).slice(0, 300));
      if (e.type === "builder.done") {
        stop();
        resolve(e.ok);
      }
    });
  });
}
