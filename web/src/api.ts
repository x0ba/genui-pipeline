import { useEffect, useState } from "react";
import type { PipelineEvent } from "../../shared/events";
import type { Persona } from "../../shared/personas";
import type { ComponentDef, Decision, ServeContext, Spec } from "../../shared/spec";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export type Bootstrap = {
  personas: Persona[];
  defaultSpec: Spec;
  config: { jevModel: string; claudeModel: string; hasTypesafeKey: boolean };
};
export type SpecState = {
  spec: Spec;
  library: Record<string, ComponentDef>;
  history: { version: number; summary?: string; by?: string; at?: string }[];
  activeRun: string | null;
};
export type GateResult = {
  gate: { defaultFits: number; personalize: boolean; specialization: { score: number } };
  runId: string | null;
};

export const api = {
  bootstrap: () => call<Bootstrap>("/bootstrap"),
  spec: (userId: string) => call<SpecState>(`/users/${userId}/spec`),
  specVersion: (userId: string, v: number) => call<Spec>(`/users/${userId}/spec/${v}`),
  serve: (userId: string, body: { request: string; context: ServeContext; currentView?: string; forceView?: string }) =>
    call<Decision>(`/users/${userId}/serve`, body),
  personalize: (userId: string, force = false) => call<GateResult>(`/users/${userId}/personalize`, { force }),
  extend: (userId: string, request: string, gapKind: string) => call<{ runId: string | null }>(`/users/${userId}/extend`, { request, gapKind }),
  reset: (userId: string) => call<{ ok: boolean }>(`/users/${userId}/reset`, {}),
  resetAll: () => call<{ ok: boolean }>("/reset", {}),
};

/** The pipeline's event stream, replayed from the start on connect. */
export function useEvents() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  useEffect(() => {
    const source = new EventSource("/api/events");
    let buffer: PipelineEvent[] = [];
    let frame = 0;
    source.onopen = () => setEvents([]);
    source.onmessage = (m) => {
      buffer.push(JSON.parse(m.data));
      frame ||= requestAnimationFrame(() => {
        const batch = buffer;
        buffer = [];
        frame = 0;
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...batch.filter((e) => !seen.has(e.id))];
        });
      });
    };
    return () => source.close();
  }, []);
  return events;
}
