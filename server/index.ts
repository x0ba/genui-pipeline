import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { personaById, PERSONAS } from "../shared/personas";
import type { ServeContext } from "../shared/spec";
import { activeRun, CLAUDE_MODEL, extend, personalize } from "./claude/agents";
import { clearHistory, emit, recent, subscribe } from "./events";
import { gate, JEV_MODEL, serve } from "./jev";
import { DEFAULT_SPEC, getLibrary, getSpec, getSpecHistory, resetAll, resetUser } from "./store";

const app = new Hono();

const persona = (id: string) => {
  const p = personaById.get(id);
  if (!p) throw new Error(`unknown user '${id}'`);
  return p;
};

app.onError((err, c) => c.json({ error: err.message }, 500));

app.get("/api/bootstrap", (c) =>
  c.json({
    personas: PERSONAS,
    defaultSpec: DEFAULT_SPEC,
    config: { jevModel: JEV_MODEL, claudeModel: CLAUDE_MODEL, hasTypesafeKey: Boolean(process.env.TYPESAFE_API_KEY) },
  }),
);

app.get("/api/library", (c) => c.json(getLibrary()));

app.get("/api/users/:id/spec", (c) => {
  const id = persona(c.req.param("id")).id;
  const history = getSpecHistory(id);
  return c.json({
    spec: getSpec(id),
    library: getLibrary(),
    history: history.map((s) => ({ version: s.version, ...s.changelog.at(-1) })),
    activeRun: activeRun(id),
  });
});

app.get("/api/users/:id/spec/:version", (c) => {
  const v = Number(c.req.param("version"));
  const spec = getSpecHistory(c.req.param("id")).find((s) => s.version === v);
  return spec ? c.json(spec) : c.json({ error: "not found" }, 404);
});

// 80/20 gate: Jev decides whether the default spec already serves this person.
// Only when it does not does Claude build a personal spec.
app.post("/api/users/:id/personalize", async (c) => {
  const p = persona(c.req.param("id"));
  const { force } = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }));
  const g = await gate(p, DEFAULT_SPEC, getLibrary());
  emit({ type: "jev.gate", userId: p.id, ...g });
  if (!g.personalize && !force) return c.json({ gate: g, runId: null });
  personalize(p).catch((e) => emit({ type: "jev.error", userId: p.id, message: `personalize failed: ${e.message}` }));
  await Bun.sleep(50);
  return c.json({ gate: g, runId: activeRun(p.id) });
});

app.post("/api/users/:id/serve", async (c) => {
  const p = persona(c.req.param("id"));
  const body = await c.req.json<{ request: string; context: ServeContext; currentView?: string; forceView?: string }>();
  try {
    const decision = await serve({
      userId: p.id,
      spec: getSpec(p.id),
      role: p.subject.kind,
      library: getLibrary(),
      request: body.request,
      context: body.context,
      currentView: body.currentView,
      forceView: body.forceView,
    });
    emit({ type: "jev.serve", userId: p.id, decision });
    if (decision.gap?.flagged)
      emit({ type: "gap.flagged", userId: p.id, request: decision.request, probability: decision.gap.probability, kind: decision.gap.kind, decisionId: decision.id });
    return c.json(decision);
  } catch (e) {
    emit({ type: "jev.error", userId: p.id, message: (e as Error).message });
    throw e;
  }
});

app.post("/api/users/:id/extend", async (c) => {
  const p = persona(c.req.param("id"));
  const { request, gapKind } = await c.req.json<{ request: string; gapKind: string }>();
  extend(p, request, gapKind).catch((e) => emit({ type: "jev.error", userId: p.id, message: `extend failed: ${e.message}` }));
  await Bun.sleep(50);
  return c.json({ runId: activeRun(p.id) });
});

app.post("/api/users/:id/reset", (c) => {
  const id = persona(c.req.param("id")).id;
  if (activeRun(id)) return c.json({ error: "a Claude run is in progress" }, 409);
  resetUser(id);
  clearHistory(id);
  return c.json({ ok: true });
});

app.post("/api/reset", (c) => {
  if (PERSONAS.some((p) => activeRun(p.id))) return c.json({ error: "a Claude run is in progress" }, 409);
  resetAll();
  clearHistory();
  return c.json({ ok: true });
});

app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    for (const e of recent()) await stream.writeSSE({ data: JSON.stringify(e), id: e.id });
    const unsubscribe = subscribe((e) => void stream.writeSSE({ data: JSON.stringify(e), id: e.id }));
    const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 15_000);
    await new Promise<void>((resolve) => stream.onAbort(resolve));
    clearInterval(ping);
    unsubscribe();
  }),
);

const port = Number(process.env.PORT ?? 8787);
console.log(`pipeline server on http://localhost:${port}  jev=${JEV_MODEL} claude=${CLAUDE_MODEL}`);
export default { port, fetch: app.fetch, idleTimeout: 0 };
