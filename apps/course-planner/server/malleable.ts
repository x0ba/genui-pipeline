import { claudeBuilder } from "@malleable/builder-claude";
import type { RegionSpec } from "@malleable/core";
import { typesafeDecider } from "@malleable/decider-typesafe";
import { createMalleable, fsStorage } from "@malleable/server";
import { chromeVerifier } from "@malleable/verify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TERM } from "../shared/data";
import { LIBRARY } from "../shared/library";
import { personaById, PERSONAS } from "../shared/personas";
import { atlasCatalog } from "./atlas";
import { APP, design } from "./design";
import { describeUser } from "./user";

const defaults = JSON.parse(readFileSync(join(APP, "data/specs/default.json"), "utf8")) as {
  profile: string;
  rationale: string[];
  regions: { dashboard: RegionSpec };
};

const env = process.env;
type Effort = "low" | "medium" | "high" | "xhigh";

export const STORE_DIR = env.MALLEABLE_STORE ?? join(APP, "data/store");

/** The demo has no accounts: the persona switcher sets this cookie, and only known personas pass. */
export const USER_COOKIE = "demo-user";

export function userFromCookie(header: string | null) {
  const id = header?.match(new RegExp(`(?:^|;\\s*)${USER_COOKIE}=([^;]+)`))?.[1];
  return id && personaById.has(id) ? id : null;
}

export const verifier = chromeVerifier({ cacheDir: join(APP, "data/cache") });

export const malleable = createMalleable({
  domain: "a university course-planning app for students and their advisors",
  library: LIBRARY,
  regions: { dashboard: { areas: ["top", "main", "aside"], default: defaults.regions.dashboard } },
  profile: defaults.profile,
  rationale: defaults.rationale,
  context: {
    device: { phone: "a phone with a narrow screen", desktop: "a desktop computer with a wide screen" },
    registration_phase: {
      planning: `Planning. Registration for ${TERM.name} opens on ${TERM.registrationOpens}.`,
      "registration-open": `Registration for ${TERM.name} is open now.`,
      "add-drop": `Add/drop period. It ends on ${TERM.addDropEnds}.`,
    },
  },
  authenticate: (req) => userFromCookie(req.headers.get("cookie")),
  describeUser: (id) => describeUser(personaById.get(id)!),
  kit: {
    reference: readFileSync(join(APP, "web/src/kit/KIT.md"), "utf8"),
    imports: ["react", "motion/react", "@kit"],
    paths: { "@kit": join(APP, "web/src/kit/index.ts") },
    root: APP,
  },
  design,
  fixtures: {
    list: PERSONAS.map((p) => ({ id: p.id, name: p.name, audience: p.subject.kind, subject: p.subject })),
    provider: join(APP, "web/src/kit/fixture.tsx"),
  },
  decider: typesafeDecider({ model: env.JEV_MODEL }),
  builder: claudeBuilder({
    cwd: APP,
    debug: Boolean(env.DEBUG_AGENT),
    effort: {
      ...(env.CLAUDE_PERSONALIZE_EFFORT ? { personalize: env.CLAUDE_PERSONALIZE_EFFORT as Effort } : {}),
      ...(env.CLAUDE_EXTEND_EFFORT ? { extend: env.CLAUDE_EXTEND_EFFORT as Effort } : {}),
    },
  }),
  verifier,
  storage: fsStorage(STORE_DIR),
  catalog: atlasCatalog,
  sources: (id) => {
    const path = join(APP, "web/src/components", `${id}.tsx`);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  },
  prompts: {
    conditions: "a subject area, seat availability or a time",
    narrowing: "courses that are still available or that start after noon",
    filters: "subject area or seat availability",
    typicalUser: "student",
    specialization: [
      "Typical: the person's needs match what most students do in a course catalog",
      "Mild preferences the default ignores, such as a preferred sort order",
      "Hard constraints or habits the default cannot express, such as a fixed work schedule or mostly using a phone",
      "A different job altogether, such as managing many other people's records",
    ],
    builder:
      "Read one similar existing component with read_component for idiom: demand-chart for SVG charts, advisee-table for tables. For intensity, such as a heatmap, use the kit's heat(t).",
  },
  // Okafor reviews what students build before everyone can use it.
  canPromote: (id) => personaById.get(id)?.subject.kind === "advisor",
});
