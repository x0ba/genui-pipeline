import type { Decision } from "./spec";

// Everything the pipeline does is an event. The inspector renders this stream.
export type PipelineEvent = { id: string; at: string; userId: string } & (
  | {
      type: "jev.gate";
      latencyMs: number;
      costUsd: number;
      inputTokens: number;
      model: string;
      defaultFits: number;
      specialization: { score: number; confidence: number; legend: Record<string, string> };
      personalize: boolean;
    }
  | { type: "jev.serve"; decision: Decision }
  | { type: "jev.error"; message: string }
  | { type: "gap.flagged"; request: string; probability: number; kind: string; decisionId: string }
  | { type: "claude.start"; runId: string; kind: "personalize" | "extend"; model: string; request?: string }
  | { type: "claude.text"; runId: string; text: string }
  | { type: "claude.tool"; runId: string; toolUseId: string; name: string; input: string }
  | { type: "claude.result"; runId: string; toolUseId: string; ok: boolean; summary: string }
  | { type: "claude.done"; runId: string; ok: boolean; costUsd: number; durationMs: number; turns: number; error?: string }
  | { type: "spec.version"; version: number; by: string; summary: string; runId?: string }
  | { type: "component.installed"; componentId: string; title: string; runId: string }
);

export type PipelineEventInput = PipelineEvent extends infer E
  ? E extends PipelineEvent
    ? Omit<E, "id" | "at">
    : never
  : never;
