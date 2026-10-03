import { chromePath } from "@malleable/verify";
import { Hono } from "hono";
import { personaById, PERSONAS } from "../shared/personas";
import { malleable, USER_COOKIE, userFromCookie } from "./malleable";

const app = new Hono();

app.get("/api/bootstrap", (c) =>
  c.json({
    personas: PERSONAS,
    userId: userFromCookie(c.req.header("cookie") ?? null),
    config: {
      decider: malleable.config.decider.model,
      builder: malleable.config.builder?.model ?? null,
      hasTypesafeKey: Boolean(process.env.TYPESAFE_API_KEY),
    },
  }),
);

app.post("/api/session", async (c) => {
  const { userId } = await c.req.json<{ userId: string }>();
  if (!personaById.has(userId)) return c.json({ error: `unknown user '${userId}'` }, 400);
  c.header("set-cookie", `${USER_COOKIE}=${userId}; Path=/; SameSite=Strict; HttpOnly`);
  return c.json({ userId });
});

app.all(`${malleable.basePath}/*`, (c) => malleable.fetch(c.req.raw));

const port = Number(process.env.PORT ?? 8787);
console.log(`course planner server on http://localhost:${port}  decider=${malleable.config.decider.model} builder=${malleable.config.builder?.model}`);
if (!chromePath())
  console.warn("no Chrome or Chromium found: generated components cannot pass the legibility audit, so the builder cannot install any. Install Chrome or set CHROME_PATH.");
export default { port, fetch: app.fetch, idleTimeout: 0 };
