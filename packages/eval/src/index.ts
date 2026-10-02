import type { Decision } from "@malleable/core";
import type { Malleable } from "@malleable/server";

// Labelled requests, served through the real pipeline, scored on whether the
// decider flags the right gaps and picks the right views and props. Rerun it
// after changing the library, the prompts, the thresholds or the decider.

export type EvalCase = {
  /** The person the request comes from. Their spec is used unless `spec` is "default". */
  user: string;
  request: string;
  /** Default: the first region. */
  region?: string;
  spec?: "default";
  /** Context keys. */
  context?: Record<string, string>;
  currentView?: string;
  expect: {
    /** Whether the request is flagged as a gap; a string also checks the gap's kind. */
    gap?: boolean | string;
    view?: string;
    /** slotId -> prop -> option key. */
    props?: Record<string, Record<string, string>>;
  };
};

export type EvalResult = { case: EvalCase; decision: Decision | null; misses: string[]; error?: string };

export type EvalReport = { results: EvalResult[]; correct: number; total: number; costUsd: number };

/** What a decision got wrong against a case's expectations. */
export function score(c: EvalCase, d: Decision): string[] {
  const misses: string[] = [];
  const gap = c.expect.gap;
  const flagged = Boolean(d.gap?.flagged);
  if (gap !== undefined) {
    const want = gap !== false;
    if (flagged !== want) misses.push(`gap ${flagged}`);
    else if (typeof gap === "string" && d.gap?.kind !== gap) misses.push(`gap kind ${d.gap?.kind}`);
  }
  if (c.expect.view && d.view !== c.expect.view) misses.push(`view ${d.view}`);
  for (const [slot, props] of Object.entries(c.expect.props ?? {}))
    for (const [k, v] of Object.entries(props)) if (d.props[slot]?.[k] !== v) misses.push(`${slot}.${k}=${d.props[slot]?.[k]}`);
  return misses;
}

export async function runEval(
  m: Pick<Malleable, "serve" | "regions">,
  cases: EvalCase[],
  opts: { concurrency?: number; onResult?: (r: EvalResult, index: number) => void } = {},
): Promise<EvalReport> {
  const results: EvalResult[] = new Array(cases.length);
  const firstRegion = Object.keys(m.regions)[0]!;
  let next = 0;
  async function worker() {
    for (let i = next++; i < cases.length; i = next++) {
      const c = cases[i]!;
      let result: EvalResult;
      try {
        const decision = await m.serve(
          c.user,
          {
            region: c.region ?? firstRegion,
            request: c.request,
            ...(c.context ? { context: c.context } : {}),
            ...(c.currentView ? { currentView: c.currentView } : {}),
          },
          c.spec ? { spec: c.spec } : {},
        );
        result = { case: c, decision, misses: score(c, decision) };
      } catch (e) {
        result = { case: c, decision: null, misses: ["error"], error: (e as Error).message };
      }
      results[i] = result;
      opts.onResult?.(result, i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));
  return {
    results,
    correct: results.filter((r) => !r.misses.length).length,
    total: results.length,
    costUsd: results.reduce((n, r) => n + (r.decision?.costUsd ?? 0), 0),
  };
}

/** One line per case, like `ok   maya gap=0.04 new-filter catalog Only show …`. */
export function formatResult(r: EvalResult, slots: string[] = []): string {
  const d = r.decision;
  if (!d) return `MISS ${r.case.user} error: ${r.error}  ${r.case.request.slice(0, 70)}`;
  const shown = slots.length ? Object.assign({}, ...slots.map((s) => d.props[s] ?? {})) : Object.assign({}, ...Object.values(d.props));
  const unmatched = d.gap?.unmatched.length ? ` unmatched=${d.gap.unmatched.map((u) => `${u.slotId}.${u.prop}`).join(",")}` : "";
  return `${r.misses.length ? "MISS" : "ok  "} ${r.case.user} gap=${(d.gap?.probability ?? 0).toFixed(2)} ${(d.gap?.kind ?? "").padEnd(17)} ${d.view.padEnd(10)} ${r.case.request.slice(0, 70)}  ${JSON.stringify(shown)}${unmatched}${r.misses.length ? `  (${r.misses.join(", ")})` : ""}`;
}
