import type { ComponentDef } from "./component";
import type { DesignInks } from "./design";
import type { GateResult } from "./serve";
import type { RegionInfo, Spec, View } from "./spec";

// The wire format between @malleable/server and @malleable/react.

/**
 * Compiled components resolve their imports through `globalThis[HOST_GLOBAL].require(specifier)`,
 * which the host page installs, so they share the host's React instance.
 */
export const HOST_GLOBAL = "__MALLEABLE_HOST__";
export type ModuleHost = { require(specifier: string): unknown };

/** `GET /spec?region=`. */
export type RegionResponse = {
  spec: Spec;
  region: RegionInfo;
  /** The region's views for this person's audience. */
  views: View[];
  home: string;
  /** Every component the person can use, in serialized form. */
  components: Record<string, ComponentDef>;
  history: { version: number; summary?: string; by?: string; at?: string }[];
  activeRun: string | null;
  design: DesignInks;
  pipeline: {
    decider: string | null;
    builder: string | null;
    /** Why generated components cannot be verified, and so cannot be installed, on this server; null when they can. */
    verifierProblem: string | null;
    canPromote: boolean;
  };
};

/** `POST /serve`. */
export type ServeRequest = {
  region: string;
  request: string;
  context?: Record<string, string>;
  currentView?: string;
  forceView?: string;
  slot?: string;
};

/** `POST /personalize`. */
export type PersonalizeResponse = { gate: GateResult; runId: string | null };

/** `GET /review`: private components waiting for promotion, for people who may promote. */
export type ReviewResponse = { components: ComponentDef[] };
