import type { Decision, PersonalizeResponse, RegionResponse, ReviewResponse, ServeRequest } from "@malleable/core";

export type ClientOptions = { endpoint: string; headers?: Record<string, string> };

export class MalleableError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The routes of @malleable/server's handler. */
export function createClient({ endpoint, headers }: ClientOptions) {
  const base = endpoint.replace(/\/$/, "");
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new MalleableError(res.status, json.error ?? res.statusText);
    return json as T;
  }
  return {
    endpoint: base,
    spec: (region: string, version?: number) =>
      call<RegionResponse>(`/spec?region=${encodeURIComponent(region)}${version === undefined ? "" : `&version=${version}`}`),
    serve: (body: ServeRequest) => call<Decision>("/serve", body),
    personalize: (region: string, force = false) => call<PersonalizeResponse>("/personalize", { region, force }),
    extend: (decisionId: string) => call<{ runId: string }>("/extend", { decisionId }),
    reset: () => call<{ ok: boolean }>("/reset", {}),
    review: () => call<ReviewResponse>("/review"),
    promote: (componentId: string) => call<{ promoted: boolean; reason?: string }>("/promote", { componentId }),
    componentUrl: (id: string, hash: string) => `${base}/components/${id}.${hash}.js`,
    eventsUrl: () => `${base}/events`,
  };
}

export type MalleableClient = ReturnType<typeof createClient>;
