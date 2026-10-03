import {
  planGate,
  planServe,
  type Decider,
  type Decision,
  type GateInput,
  type GateResult,
  type ServeInput,
} from "@malleable/core";

// Runs one decider call: the questions come from core, and every answer is
// checked against them before the result is used.

async function timed<T>(fn: () => Promise<T>) {
  const start = performance.now();
  const result = await fn();
  return { result, latencyMs: Math.round(performance.now() - start) };
}

export async function runServe(decider: Decider, input: ServeInput & { userId: string; specVersion: number }): Promise<Decision> {
  const plan = planServe(input);
  const { result, latencyMs } = await timed(() => decider.ask({ state: plan.state, questions: plan.questions }));
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    specVersion: input.specVersion,
    ...plan.read(result.answers),
    latencyMs,
    inputTokens: result.usage.inputTokens,
    costUsd: result.usage.costUsd,
    model: result.model,
  };
}

export type GateRun = GateResult & { latencyMs: number; costUsd: number; inputTokens: number; model: string };

export async function runGate(decider: Decider, input: GateInput): Promise<GateRun> {
  const plan = planGate(input);
  const { result, latencyMs } = await timed(() => decider.ask({ state: plan.state, questions: plan.questions }));
  return { ...plan.read(result.answers), latencyMs, costUsd: result.usage.costUsd, inputTokens: result.usage.inputTokens, model: result.model };
}
