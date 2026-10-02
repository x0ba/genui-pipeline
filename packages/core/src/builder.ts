import type { z } from "zod";
import type { ComponentDef } from "./component";
import type { DesignContract } from "./design";
import type { Slot } from "./spec";

// The builder is the slow model. The library writes its prompts and tools and
// all validation lives in the tools, so any agent framework behind an adapter
// gets the same guarantees.

export type ToolResult = { ok: boolean; text: string };

export type Tool = {
  name: string;
  description: string;
  /** A zod object shape. Maps are catchall objects, because z.record() breaks some tool listings. */
  input: z.ZodRawShape;
  readOnly?: boolean;
  run(input: Record<string, unknown>): Promise<ToolResult>;
};

export type BuilderRun = {
  kind: "personalize" | "extend";
  runId: string;
  system: string;
  prompt: string;
  tools: Tool[];
  /** Whether the run has submitted a valid result. */
  done: () => boolean;
  /** The model's prose between tool calls, for the event stream. */
  onText?: (text: string) => void;
};

export interface Builder {
  /** Shown in devtools. */
  readonly model?: string;
  run(input: BuilderRun): Promise<{ ok: boolean; costUsd: number; turns: number; error?: string }>;
}

// ---------------------------------------------------------------- verifier

/** Sample data a generated component is rendered with during verification. */
export type Fixture = { id: string; name: string; audience?: string; [key: string]: unknown };

export type FixtureSet = {
  list: Fixture[];
  /**
   * Path to a module that default-exports `({ fixture, children }) => ReactNode`,
   * which wraps a component in the app's providers for one fixture.
   */
  provider: string;
};

export type KitConfig = {
  /** The reference the builder reads: module shape, data hooks, helpers. */
  reference: string;
  /** What generated components may import. `react` is always allowed. */
  imports: string[];
  /** Specifier -> path, for imports that are not packages, such as `@kit`. */
  paths?: Record<string, string>;
  /** Directory packages such as `motion/react` resolve from during verification. */
  root: string;
};

export type VerifyInput = {
  def: ComponentDef;
  /** The compiled module. */
  code: string;
  /** Fixtures whose audience can use the component, the author's first. */
  fixtures: Fixture[];
  fixtureProvider: string;
  kit: KitConfig;
  design: DesignContract;
  /** Options a slot adds to the component's param props, rendered along with the component's own. */
  options?: Slot["options"];
};

/** Thrown when verification itself cannot run: not something the component's author can fix. */
export class VerifierUnavailable extends Error {}

export interface Verifier {
  /** Static checks on the source, before anything is compiled or run. */
  check(source: string, opts: { imports: string[] }): string[];
  compile(source: string, opts: { imports: string[] }): Promise<{ code: string; hash: string } | { errors: string[] }>;
  /** Render matrix, legibility audit and click-through. Returns errors, or an empty list. */
  verify(input: VerifyInput): Promise<string[]>;
  /** Why verification cannot run on this server, or null. */
  unavailable?(): string | null;
}
