import type { Persona } from "../../shared/personas";

// The demo's own routes. Everything about specs and the pipeline goes through
// @malleable/react's client instead.

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
  /** Whoever the session cookie names, if anyone. */
  userId: string | null;
  config: { decider: string | null; builder: string | null; hasTypesafeKey: boolean };
};

export const api = {
  bootstrap: () => call<Bootstrap>("/bootstrap"),
  /** Signs in as a persona: the server sets the session cookie every later request carries. */
  session: (userId: string) => call<{ userId: string }>("/session", { userId }),
};
