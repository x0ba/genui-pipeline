import type { Decision, GateResult, Unmatched } from "./serve";

// Everything the pipeline does is an event, scoped to the person it is for.
// Devtools renders this stream.
export type MalleableEvent = { id: string; at: string; userId: string } & (
  | ({ type: "decider.gate"; region: string; latencyMs: number; costUsd: number; inputTokens: number; model: string } & GateResult)
  | { type: "decider.serve"; decision: Decision }
  | { type: "error"; message: string }
  | { type: "gap.flagged"; region: string; request: string; probability: number; kind: string; unmatched: Unmatched[]; decisionId: string }
  | { type: "builder.start"; runId: string; kind: "personalize" | "extend"; region: string; model: string; request?: string }
  | { type: "builder.text"; runId: string; text: string }
  | { type: "builder.tool"; runId: string; toolUseId: string; name: string; input: string }
  | { type: "builder.result"; runId: string; toolUseId: string; ok: boolean; summary: string }
  | { type: "builder.done"; runId: string; ok: boolean; costUsd: number; durationMs: number; turns: number; error?: string }
  | { type: "spec.version"; version: number; by: string; summary: string; runId?: string }
  | { type: "component.installed"; componentId: string; title: string; runId: string; scope: "private" | "shared" }
  | { type: "component.promoted"; componentId: string; title: string }
);

export type MalleableEventInput = MalleableEvent extends infer E ? (E extends MalleableEvent ? Omit<E, "id" | "at"> : never) : never;

export type EventOf<T extends MalleableEvent["type"]> = Extract<MalleableEvent, { type: T }>;
