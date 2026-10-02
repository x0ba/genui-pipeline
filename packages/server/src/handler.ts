import type { Decision, MalleableEvent, PersonalizeResponse, RegionResponse, ReviewResponse, ServeRequest } from "@malleable/core";
import type { MalleableConfig } from "./config";
import type { EventBus } from "./events";

// A web-standard fetch handler: mount it in Hono, Next.js route handlers,
// Bun.serve or anything else that takes a Request and returns a Response.

export type HandlerApi = {
  basePath: string;
  regions: Record<string, unknown>;
  config: Pick<MalleableConfig, "authenticate">;
  events: EventBus;
  regionFor(userId: string, region: string, version?: number): Promise<RegionResponse>;
  serve(userId: string, body: ServeRequest): Promise<Decision>;
  personalize(userId: string, region: string, force?: boolean): Promise<PersonalizeResponse>;
  extend(userId: string, decisionId: string): Promise<{ runId: string }>;
  reset(userId: string): Promise<void>;
  review(userId: string): Promise<ReviewResponse>;
  promote(userId: string, componentId: string): Promise<{ promoted: boolean; reason?: string }>;
  artifact(userId: string, id: string, hash: string): Promise<string | null>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    const parsed = (await req.json()) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

const COMPONENT = /^\/components\/([a-z][a-z0-9-]*)\.([0-9a-f]{8,64})\.js$/;
const PING_MS = 15_000;

function eventStream(m: HandlerApi, userId: string, req: Request) {
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };
      const send = (e: MalleableEvent) => write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`);
      for (const e of m.events.recent(userId)) send(e);
      write("event: ready\ndata: \n\n");
      const unsubscribe = m.events.subscribe((e) => e.userId === userId && send(e));
      const ping = setInterval(() => write("event: ping\ndata: \n\n"), PING_MS);
      close = () => {
        clearInterval(ping);
        unsubscribe();
        close = () => {};
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => close());
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}

export function createHandler(m: HandlerApi): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(m.basePath)) return json({ error: "not found" }, 404);
    const path = url.pathname.slice(m.basePath.length) || "/";
    try {
      const userId = await m.config.authenticate(req);
      if (!userId) return json({ error: "not signed in" }, 401);
      const route = `${req.method} ${path}`;

      if (route === "GET /spec") {
        const version = url.searchParams.get("version");
        const region = url.searchParams.get("region") ?? Object.keys(m.regions)[0]!;
        return json(await m.regionFor(userId, region, version === null ? undefined : Number(version)));
      }
      if (route === "POST /serve") {
        const b = await body<ServeRequest>(req);
        return json(
          await m.serve(userId, {
            region: String(b.region ?? Object.keys(m.regions)[0]),
            request: String(b.request ?? ""),
            context: b.context && typeof b.context === "object" ? (b.context as Record<string, string>) : {},
            ...(b.currentView ? { currentView: String(b.currentView) } : {}),
            ...(b.forceView ? { forceView: String(b.forceView) } : {}),
            ...(b.slot ? { slot: String(b.slot) } : {}),
          }),
        );
      }
      if (route === "POST /personalize") {
        const b = await body<{ region: string; force: boolean }>(req);
        return json(await m.personalize(userId, String(b.region ?? Object.keys(m.regions)[0]), b.force === true));
      }
      if (route === "POST /extend") {
        const b = await body<{ decisionId: string }>(req);
        if (!b.decisionId) return json({ error: "decisionId is required" }, 400);
        return json(await m.extend(userId, String(b.decisionId)));
      }
      if (route === "POST /reset") {
        await m.reset(userId);
        return json({ ok: true });
      }
      if (route === "GET /review") return json(await m.review(userId));
      if (route === "POST /promote") {
        const b = await body<{ componentId: string }>(req);
        if (!b.componentId) return json({ error: "componentId is required" }, 400);
        return json(await m.promote(userId, String(b.componentId)));
      }
      if (route === "GET /events") return eventStream(m, userId, req);

      const component = req.method === "GET" ? COMPONENT.exec(path) : null;
      if (component) {
        const code = await m.artifact(userId, component[1]!, component[2]!);
        if (code === null) return json({ error: "not found" }, 404);
        return new Response(code, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            // Private components are only ever fetched by their owner.
            "cache-control": "private, max-age=31536000, immutable",
          },
        });
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (typeof status === "number") return json({ error: (e as Error).message }, status);
      console.error("[malleable]", e);
      return json({ error: "internal error" }, 500);
    }
  };
}
