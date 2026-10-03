# Library design: malleable React interfaces

Status: draft. The name `malleable` and the package scope `@malleable/*` are placeholders.

## Goal

Let any React app contain regions of interface that each person can reshape by asking for what they need. A fast model that can only choose between listed options serves every request. A slower model changes what the options are, and every change passes validation before anyone sees it. The course planner in this repo is the first app built this way. The library pulls out what it does so other apps can do the same.

Decisions made so far:

- Apps adopt the library one region at a time. A region is one part of an ordinary hand-written page, and the rest of the app does not change.
- Generating new components is part of the first version.
- It is an open-source library. Apps run it on their own servers with their own model keys.

Not in the first version:

- Frameworks other than React.
- React Server Components inside a region. Regions render on the client.
- A hosted service.

## Concepts

- **Component definition.** Describes one component: what it shows, which audiences can use it, and its props. Each prop is a closed set of options, and each option has a plain-language description of when it is the right choice. The descriptions are the decider's prompt.
- **Region.** A named place on a page, such as `dashboard`. It declares its areas (in the demo, `top`, `main` and `aside`), the layouts it can take, and a default spec.
- **Spec.** One person's interface: for each region, a list of views, each a layout of slots, each slot a component with prop values. Everyone starts on the default.
- **Kit.** The module generated components import. It is their only way to reach data and actions. The app writes it.
- **Design contract.** The app's stylesheets, themes, colour tokens, the text and background pairs that are safe, and its design rules.
- **Fixtures.** Sample people and their data, used to render components during verification.
- **Decider.** The fast model (Jev in the demo). It answers batches of multiple-choice questions and never generates anything.
- **Builder.** The slow model (Claude in the demo). It writes specs and components through tools that validate before they save.
- **Verifier.** The checks a generated component must pass before it is installed.
- **Storage.** Where specs, component definitions and compiled components live.

## Packages

| Package | Contents |
| --- | --- |
| `@malleable/core` | Schemas, `defineComponent`, `checkSpec`, prop resolution, question building, event types. No React, no Node APIs. |
| `@malleable/react` | `MalleableProvider`, `Region`, `AskBar`, hooks, the slot error boundary, the runtime contrast guard, the loader for compiled components. |
| `@malleable/server` | `createMalleable`, a web-standard `fetch` handler, the builder's tools, the storage interface with a filesystem adapter, the event stream. |
| `@malleable/verify` | Static checks, the compiler, and the render and legibility audit in headless Chrome. |
| `@malleable/decider-typesafe` | Decider adapter for Jev through `@typesafe-ai/sdk`. |
| `@malleable/builder-claude` | Builder adapter for the Claude Agent SDK. |
| `@malleable/devtools` | The Pipeline panel: decisions per slot, the event stream, costs, spec history. |
| `@malleable/eval` | Runs labelled requests against a spec to measure routing and gap detection. |

## Defining components

A definition and its implementation are separate, so the server can import every definition without importing React components.

```ts
// shared/components.ts, imported by the server and the client
import { choice, defineComponent, param } from "@malleable/core";
import { z } from "zod";

export const gpaChart = defineComponent({
  id: "gpa-chart",
  title: "GPA distribution",
  description: "How the advisor's students are spread across GPA ranges.",
  audiences: ["advisor"],
  props: {
    mark: choice(
      {
        bar: "Bars side by side, to compare the size of each range",
        pie: "Slices of one circle, to show each range's share of the whole",
      },
      { default: "bar" },
    ),
    bins: param(z.array(z.number()).min(2), {
      options: {
        "whole-points": { value: [0, 1, 2, 3, 4], when: "Four ranges: 0–1, 1–2, 2–3 and 3–4" },
        halves: { value: [0, 2, 4], when: "Two ranges: 0–2 and 2–4" },
      },
      default: "whole-points",
    }),
  },
});
```

```tsx
// web/components/gpa-chart.tsx
import { implement } from "@malleable/react";
import { gpaChart } from "../../shared/components";

export default implement(gpaChart, function GpaChart({ mark, bins }) {
  // mark is "bar" | "pie"; bins is number[]
});
```

There are two kinds of prop:

- A `choice` prop is an enum. The component receives the option key.
- A `param` prop pairs each option key and description, which the decider chooses between, with a typed value the component receives. The value must parse with the prop's schema.

`param` fixes the GPA-range problem described in the README without writing code. When a request asks for ranges no option gives, the builder adds a new option to that slot, such as `{ "thirds": { value: [0, 1.33, 2.67, 4], when: "Three equal ranges" } }`. The library checks the value against the schema and saves the option. This works for builtin components too. In the demo, only generated components could gain options.

Components receive their props spread, typed from the definition, instead of the demo's `{ props: Record<string, string> }`. Generated components follow the same contract.

`defineComponent` rejects a definition with fewer than two options in a prop, a default that is not an option, or a `param` option whose value does not parse.

## Regions on the client

```tsx
import { AskBar, MalleableProvider, Region } from "@malleable/react";
import * as kit from "./kit";
import { components } from "./components";

<MalleableProvider
  endpoint="/api/malleable"
  components={components}   // builtin implementations
  modules={{ kit }}         // what generated components may import besides react
  context={{ device: isPhone ? "phone" : "desktop" }}
>
  <AppShell>
    <Region name="dashboard" />
    <AskBar region="dashboard" />
  </AppShell>
</MalleableProvider>
```

- `Region` loads the person's spec for that region and renders the current view. It renders the region's home view with default props until the first decision arrives.
- `AskBar` is an optional text input that sends a request to its region. Apps can build their own with `useRegion(name)`, which returns `{ view, decision, gap, request(text), build(), history }`.
- Inside any slot, `useSlot()` returns `requestChange(text)`, so a person can point at one component and ask for a change, such as "make this denser". The decider is only asked about that slot's props, which is cheaper and more precise than a request to the whole region.
- The client sends context as keys only. The server maps each key to the description the decider reads, so no prompt text comes from the browser.

## Server

```ts
import { createMalleable, fsStorage } from "@malleable/server";
import { typesafeDecider } from "@malleable/decider-typesafe";
import { claudeBuilder } from "@malleable/builder-claude";
import { chromeVerifier } from "@malleable/verify";

export const malleable = createMalleable({
  domain: "a university course-planning app for students and their advisors",
  library: [courseSearch, courseDetail, weekCalendar /* … */],
  regions: { dashboard: { areas: ["top", "main", "aside"], default: defaultSpec } },
  context: {
    device: { phone: "a phone with a narrow screen", desktop: "a desktop computer with a wide screen" },
    phase: { planning: "Planning. Registration opens on 14 April.", "add-drop": "Add/drop period." },
  },
  authenticate: async (req) => (await session(req))?.userId ?? null,
  describeUser: async (userId) => ({ audience: "student", profile: "…", needs: "…", signals: ["…"] }),
  kit: { reference: readFileSync("kit/KIT.md", "utf8"), imports: ["react", "motion/react", "@kit"] },
  design: courseDesign,
  fixtures: courseFixtures,
  decider: typesafeDecider({ model: "jev-latest" }),
  builder: claudeBuilder({ model: "claude-opus-5-5", maxTurns: 40, maxUsd: 6 }),
  verifier: chromeVerifier(),
  storage: fsStorage("data/runtime"),
});

// Hono, Next.js route handlers, Bun.serve: anything that takes a fetch handler.
export default { fetch: malleable.fetch };
```

`authenticate` decides who the request is for. The demo trusted the user id in the URL. The library never does.

### Routes

The handler mounts under one prefix, `/api/malleable` in the example above.

| Route | Purpose |
| --- | --- |
| `GET /spec?region=` | The person's spec for a region, the component definitions it uses, and the version history. |
| `POST /serve` | Serves a request. Body: `region`, `request`, context keys, and optional `currentView`, `forceView` and `slot`. |
| `POST /personalize` | Runs the gate, then the builder if the gate passes or `force` is set. |
| `POST /extend` | Body: `decisionId`. The server looks up the decision it stored, so the client cannot invent a gap. |
| `GET /components/:id.:hash.js` | A compiled generated component. Served as immutable. |
| `GET /events` | Server-sent events for the authenticated person only. |
| `POST /reset` | Deletes the person's spec. |

## Spec format

The demo's schema changes in three ways:

- `roles: ("student" | "advisor")[]` becomes `audiences: string[]`, using whatever audiences the app defines. Apps with one audience leave it out.
- The top-level `views` becomes `regions: { [name]: { home, views } }`. One person has one spec and one `profile`, shared by all regions.
- A slot's `region` field becomes `area`, and each region declares its own areas. A slot can carry `options`, extra options for its `param` props that the builder added for this person.

```ts
type Spec = {
  id: string;
  version: number;
  userId: string | null;
  parent: string | null;
  profile: string;
  regions: Record<string, { home: string; views: View[] }>;
  rationale: string[];
  changelog: ChangelogEntry[];
};
type View = { id: string; title: string; purpose: string; layout: string; audiences?: string[]; slots: Slot[] };
type Slot = {
  id: string;
  component: string;
  area: string;
  props: Record<string, string>;
  adaptive: string[];
  options?: Record<string, Record<string, { value: unknown; when: string }>>;
};
```

Layouts become definitions too, each with the description the decider reads and a CSS grid template. The library ships `main-aside`, `stack` and `columns`.

## The decider

```ts
interface Decider {
  ask(input: { state: Record<string, unknown>; questions: Record<string, Question> }): Promise<{
    answers: Record<string, Answer>;
    usage: { inputTokens: number; costUsd: number };
    model: string;
  }>;
}
type Question =
  | { kind: "choice"; prompt: string | object; options: Record<string, string> }
  | { kind: "binary"; prompt: string | object; true: string; false: string }
  | { kind: "score"; prompt: string; levels: string[] };
type Answer =
  | { kind: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { kind: "binary"; probability: number }
  | { kind: "score"; score: number; confidence: number };
```

The library builds the questions, as `serve` and `gate` in `server/jev.ts` do now, and checks every answer. An answer that is not one of the listed options is replaced with the default and logged. The guarantee that the decider cannot produce a screen the renderer cannot draw belongs to the library, whatever model sits behind the adapter.

The prompts become templates. The library fills in the app's `domain`, the context descriptions and the component definitions, and no words about any one app remain in it. The gate's four specialization levels and the gap question's examples ("a subject area, seat availability") are the parts of today's prompts that need an app-supplied replacement.

The thresholds, now fixed at 0.5 for gaps and 1.5 for specialization, become settings, because a different model's probabilities will be calibrated differently.

## The builder

```ts
interface Builder {
  run(input: { kind: "personalize" | "extend"; system: string; prompt: string; tools: Tool[]; done: () => boolean }): Promise<{
    ok: boolean;
    costUsd: number;
    turns: number;
    error?: string;
  }>;
}
```

The library writes the prompts and the tools. The adapter only runs an agent loop over them. All validation lives in the tools, so any agent framework gets the same guarantees:

- `get_user`, `library_list`, `kit_reference`, `design_reference`, `read_component`, for reading.
- `write_component`, `submit_spec`, `submit_spec_patch`, `add_option`, which validate and then save.

The Pattern Atlas becomes an optional catalog plugin that adds `catalog_search` and `catalog_get`. Whether the atlas itself can ship with an open-source library is an open question.

Limits carry over from the demo: one run per person at a time, a turn cap and a cost cap per run.

## Kit

The kit is an ordinary TypeScript module the app writes. The provider passes it to generated components as `@kit`. It has two jobs:

- It is the permission boundary. Kit hooks should wrap the data hooks the app already has, so they run with the viewing person's permissions. A generated component can show someone no more than they could already see.
- It is documented for the builder. The first version reads a handwritten reference, as `KIT.md` is now. Generating it from the module's types and doc comments can come later.

Functions that change data are wrapped with `action()`. An action throws unless it is called during a user gesture (`navigator.userActivation.isActive`), so a generated component cannot, for example, submit a plan as soon as it renders.

## Design contract

```ts
const courseDesign = defineDesign({
  stylesheets: ["https://vercel.com/geist/vercel-brand.css", "/styles/app.css"],
  themes: { light: { attribute: ["data-theme", "light"] }, dark: { attribute: ["data-theme", "dark"] } },
  textColors: ["--vbg-text-primary", "--vbg-text-secondary"],
  safePairs: [
    { text: ["--vbg-text-primary", "--vbg-text-secondary"], background: ["--vbg-surface-primary", "--vbg-surface-secondary"] },
    { text: ["--vbg-text-on-contrast"], background: ["--vbg-surface-contrast"] },
  ],
  rules: readFileSync("kit/DESIGN.md", "utf8"),
});
```

Four things read it:
- The static check that rejects raw colour values.
- The legibility audit, which needs the stylesheets and how to switch themes.
- The runtime contrast guard.
- The builder's `design_reference` tool.

The demo's `heat()` ramp stays in the app's kit. The library only needs to know that the ramp's pairs are safe.

## Generated code: build, verify, deliver

The demo imports generated modules into the server process to check them, and the browser loads them through Vite's `/@fs/` route. Neither works outside local development. The library replaces both:

1. **Static checks on the syntax tree**, not regular expressions. The module may import only from the configured allowlist. It may not reference globals outside an allowlist (no `window`, `document`, `globalThis`, `fetch`, `Function`, `eval` or storage APIs). It must default-export a function, and it may not contain raw colour values.
2. **Compile** with esbuild to one ES module. Imports of `react` and the kit resolve through a lookup the host page provides, so the module uses the host's own React instance whichever bundler the host uses. This needs no import maps and no `eval`, so it works under a strict content security policy.
3. **Verify only in headless Chrome.** The render matrix (every option of every prop, for every fixture whose audience can use the component, rendered with `renderToString` and on the client), the legibility audit and the click-through all run in the browser page. Generated code never runs in the server process. The browser can be local, through puppeteer, or remote in a sandbox, through a different verifier adapter.
4. **Store** the compiled file under its content hash, and record the hash in the component definition.
5. **Deliver** from `GET /components/:id.:hash.js`. The client imports it, renders it inside the slot error boundary and the contrast guard, and caches it forever because the hash changes when the code does.

Development and production use the same path, which also removes the Vite cache-busting workaround in `web/src/runtime/registry.tsx`.

## Who can use a generated component

A generated component starts out scoped to the person whose request produced it. Only that person's spec can use it. It becomes shared, and available to the builder for everyone, only when it is promoted. The app decides how promotion happens through an `onPromote` hook. The default is a manual promote button in devtools. A later adapter could open a pull request that adds the component to the app's source as a builtin, so it goes through normal code review.

This matters because one person's request text reaches the builder. If generated components joined the shared library right away, as they do in the demo, a crafted request could steer the builder into writing code that then runs in other people's sessions.

The demo's rule for rewrites still holds: a rewrite of an installed component cannot drop any audience, prop or option, because other specs may use them.

## Threat model

| Input | Trust | Handling |
| --- | --- | --- |
| The app's library, kit, design contract and server config | Trusted | Written by the app's developers. |
| Model output: specs and component code | Not trusted | Specs pass the schema and `checkSpec`. Code passes the static checks and is only ever run in headless Chrome and in the viewer's browser. |
| Request text from people using the app | Not trusted, may be a prompt injection | Reaches the decider only as state, and the decider can only choose. Reaches the builder, whose output is private to that person until promoted. |
| Context from the browser | Not trusted | Only keys are accepted. The server supplies the descriptions. |
| The user id | Not trusted | `authenticate` decides it on the server. |

The first version renders generated components in the same page as the app. The static checks, the kit boundary, user-gesture actions and a content security policy make misuse hard, but they are not a sandbox. An iframe mode, which renders each generated component in a sandboxed frame and bridges kit calls over `postMessage`, is planned for apps that need real isolation.

## Versioning and migrations

Component definitions carry a version. When developers change a builtin, they declare how saved specs should follow it:

```ts
defineComponent({
  id: "course-search",
  version: 2,
  migrations: { 2: { renamed: { "props.ranking.open-seats": "seats" }, removed: { "props.grouping.time-of-day": "none" } } },
  /* … */
});
```

When a spec loads, the library applies migrations, then runs `checkSpec`. A slot that still fails is dropped, and a `system` entry in the changelog records why. A region with no valid view falls back to the default spec.

## Descriptions are prompts, so they need tests

Changing the wording of an option or a view's purpose changes what the decider picks. `@malleable/eval` runs a file of labelled requests against a spec and reports how often the view, the props and the gap flag match the labels. It grows out of `scripts/try-gaps.ts`. Apps should run it in CI whenever they change descriptions.

```ts
export default [
  { request: "Show my week", expect: { view: "schedule" } },
  { request: "GPA pie chart with 0–2 and 2–4", expect: { gap: "new-option" } },
];
```

## Where this repo's code goes

| Now | Becomes |
| --- | --- |
| `shared/spec.ts` | `core`: schemas and `checkSpec`, with audiences, regions and areas generalized |
| `shared/events.ts` | `core`: event types |
| `server/jev.ts` | `core`: question building; `server`: serve and gate; `decider-typesafe`: the client |
| `server/claude/agents.ts` | `server`: prompts and tools; `builder-claude`: the agent loop |
| `server/claude/check.ts` | `verify`: static checks and the render matrix |
| `server/claude/contrast.ts`, `web/src/kit/audit.tsx` | `verify`: the legibility audit |
| `web/src/runtime/contrast.ts` | `react`: the runtime guard; `verify`: shared measurement |
| `server/store.ts` | `server`: the storage interface and filesystem adapter |
| `server/index.ts`, `server/events.ts` | `server`: the fetch handler and event stream |
| `web/src/runtime/Renderer.tsx`, `registry.tsx` | `react`: `Region` and the component loader |
| `web/src/pipeline/PipelinePanel.tsx` | `devtools` |
| `web/src/kit/harness.tsx`, `shared/personas.ts` | The app's fixtures |
| `shared/library.ts`, `shared/data.ts`, `web/src/components/`, `web/src/kit/`, `KIT.md` | The course planner app |
| `server/atlas.ts`, `data/atlas.json` | An optional catalog plugin |

## Plan

1. **Extract without changing behaviour.** Move the code into Bun workspaces: `packages/*` for the library and `apps/course-planner` for the demo. Keep today's schema and APIs. Done when the demo behaves as it does now, `typecheck` passes, and `try-gaps.ts` gives the same results.
2. **Start the second app at once, and generalize each seam when it gets in the way.** In order: audiences, context keys, the `domain` prompt text, fixtures, the design contract, the kit reference, and regions inside a normal page.
3. **Typed definitions and `param` props.** `defineComponent`, `implement`, spread props, and the `add_option` tool.
4. **Production path for generated code.** Syntax-tree checks, compiled artifacts, verification only in Chrome, private scope and promotion.
5. **Open-source readiness.** The eval package, devtools, documentation, a published threat model, and the iframe mode.

## The second app

It should differ from the course planner wherever the library makes assumptions. A personal finance tracker, built with Tailwind and shadcn/ui, would test:

- **Async data.** Kit hooks that fetch from an API and suspend, instead of reading static data in memory.
- **A different design system.** A second design contract, which shows whether the audit and the guard depend on the Vercel stylesheet.
- **`param` props.** Date ranges, amount buckets and category groupings are exactly the requests that ask for values no option lists.
- **Regions in a normal page.** One malleable dashboard region inside hand-written navigation and settings pages.
- **One audience.** Checks that apps without roles work.

A support-ticket inbox is the alternative if heavier actions matter more: bulk triage, assignment, and two audiences (agents and leads). It would test `action()` and user gestures harder, and `param` props less.

## Open questions

- **Probabilities from other models.** The gap check depends on calibrated probabilities. Can a decider adapter for a general model with structured output supply them, or is a model like Jev required?
- **The Pattern Atlas.** Can it ship with the library, or only as an optional download?
- **Isolation by default.** Should the first published version render generated components in the same page, or should it wait for the iframe mode?
- **Profiles.** Should each region's spec have its own profile, or is one per person enough?
- **Promotion.** Should an automatic rule, such as "used by N people with no errors", count toward promotion, or only human review?
- **The name.** Check npm and GitHub before anything is published.
