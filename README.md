# GenUI Pipeline

This repo serves as a proof of concept for a "GenUI" interface, an interface that can change based on its specific user's needs and wants. This system uses two models: Jev, which is fast and cheap and can only select between options it is given, and a conventional model like Opus 5.5.

All the UI elements that appear on the screen are spec-driven. Each individual user's interface is described by a JSON document (the spec), and the frontend is a generic renderer that renders exactly what the spec describes. Every UI change is either picking from options the spec already lists, or an edit to the spec that has to pass validation first.

The pipeline is a library, `@malleable/*` in `packages/`, so other React apps can use it. Its design is in [docs/library-design.md](docs/library-design.md). The demo in `apps/course-planner` is a university course planner built on it, with three people to switch between:

- **Maya Chen**, a third-year CS student. She works library shifts on weekday mornings, plans on her phone, and avoids full sections.
- **Dr. Adaeze Okafor**, an advisor with 38 advisees. She works at a desktop and acts on the roster in bulk.
- **Sam Rivera**, a first-year student whose needs match the default app.

## Interesting Observations

- Despite the UI being spec-driven with the intent of making sure nothing ever looks "wrong", things can still look "wrong." For example, the spec never makes sure UI elements have enough contrast with each other to be legible, which seems to also be something LLMs continuoully struggle with. As always, the solution was to add verification, a little like the verification the pipeline does with UI specs. Whenever a component is installed, it is rendered in a headless Chrome with the app's real stylesheets, and a contrast audit is run. The component is rejected if any text is below 4.5:1 (3:1 for large text), overlaps other text, renders under 10px, or has a fill the stylesheet overrides.

<table>
  <tr>
    <td align="center"><b>Unverified</b></td>
    <td align="center"><b>Verified</b></td>
  </tr>
  <tr>
    <td><img src="assets/unverified_contrast.png" width="400" alt="Verified contrast heatmap"></td>
    <td><img src="assets/verified_contrast.png" width="400" alt="Unverified contrast heatmap"></td>
  </tr>
</table>

- Jev treats a close match as an exact one. I asked for a pie chart of students with GPAs from 0–1, 1–2, 2–3 and 3–4, and Claude built that chart. When I then asked for GPAs from 0–2 and 2–4, Jev showed the same four-range chart again. Every setting Jev picks has to be one of the options the spec lists, so it rounded my request to the nearest one, and the one check for missing features looked at the app as a whole, where a GPA pie chart already existed. The fix was to ask Jev, for each setting of the chart it picks, whether the request names a value that none of the options gives. If it does, Jev flags the request, and Claude adds the missing option to the existing component instead of building a duplicate.

## Packages

| Package | Contents |
| --- | --- |
| `@malleable/core` | Component definitions (`defineComponent`, `choice`, `param`), the spec schema and checks, migrations, layouts, the decider's question building, and the protocol types. No React and no Node APIs. |
| `@malleable/react` | `MalleableProvider`, `Region`, `AskBar`, `useRegion`, `useSlot`, `implement` and `action`. |
| `@malleable/server` | `createMalleable` and its `fetch` handler, the builder's prompts and tools, storage, and the event stream. |
| `@malleable/verify` | Static checks, the compiler, and verification in headless Chrome. |
| `@malleable/decider-typesafe` | The decider adapter for Jev. |
| `@malleable/builder-claude` | The builder adapter for the Claude Agent SDK. |
| `@malleable/devtools` | The Pipeline panel. |
| `@malleable/eval` | Runs labelled requests against a spec and scores the decider's answers. |

## How it works

Everyone starts on one shared default spec. Jev serves every request from whatever spec the person has. Claude only runs when Jev reports that the spec falls short: either the default does not fit the person at all, or a request asks for something no view can show.

### The spec

A spec has one region per part of the page the app makes adaptable. The course planner has one, `dashboard`. Each region has a list of views. Each view has a `purpose`, a `layout`, and a list of slots. Each slot places one library component in one of the region's areas (`top`, `main`, or `aside`) and sets its props. The schema lives in `packages/core/src/spec.ts`.

Slot props come in two kinds:

- **Fixed props** in `props` encode stable preferences, such as a dense table for someone who works in bulk. They never change at runtime.
- **Adaptive props**, listed by key in `adaptive`, are the ones Jev chooses on every request, such as which time filter a course search applies.

Every component instantiates an entry from the Pattern Atlas, a catalog of 119 UI design patterns in `apps/course-planner/data/atlas.json`. A component's props are sub-dimensions of its atlas entry, and each option carries a plain-language description of when it is the right choice. Jev reads those descriptions as the options of its questions, so the wording of a spec is also Jev's prompt. The builtin definitions are in `apps/course-planner/shared/library.ts`.

A spec passes two checks before it is saved. Zod checks its shape. `checkSpec` checks that the parts line up: every slot names a component the person can use, every fixed value is one of that prop's options, no prop is both fixed and adaptive, each component supports the person's audience, and `home` names a real view. When a saved spec no longer passes, for example after a builtin changes, the library applies the component's migrations, drops slots that still fail, and records why in the changelog.

The shared default is `apps/course-planner/data/specs/default.json`. It has four views: `catalog`, `schedule`, `progress`, and `demand`. A personal spec is saved to `apps/course-planner/data/store/specs/<userId>.json` with every earlier version kept.

### Serving a request

`serve` answers each request with one Jev call. The call carries the person's profile, their audience, the context (device and registration phase), the current view, and the request text. The browser sends context as keys only, and the server supplies the descriptions Jev reads. The call asks a batch of questions:

- `view`: which view answers the request. The options are the views' `purpose` strings.
- `gap`: a yes-or-no question that returns a probability. Does the request need a filter, chart, data view, or action that no view offers?
- `gap_kind`: what kind of thing is missing, if anything.
- `layout`: `main-aside`, `stack`, or `columns`.
- One question per adaptive prop in every view. Jev answers them all in the same call, and the server keeps only the answers for the view Jev picked. That saves a second round trip.
- For each adaptive prop in the primary area, a yes-or-no question: does the request ask for a value of this prop, such as other ranges, groups or cut-offs, that none of its options gives? A prop question always picks the nearest option, so without this a view that fits but lacks the exact option, such as GPA ranges of 0–2 and 2–4 when the chart only has one-point and half-point ranges, would be served silently.

Every answer is checked against the options the spec lists, and an answer that is not one of them is replaced with the default and logged, so no decider can produce a screen the renderer cannot draw. If the gap probability is 0.5 or higher, or any prop of the chosen view has no matching option, the server flags the request and shows the closest view while the person decides whether to have Claude build the missing part. The server keeps each decision, so `POST /extend` takes only a decision id and the client cannot invent a gap.

### Deciding whether to personalize

The **Personalize** button does not go straight to Claude. The gate first asks Jev two questions about the person's stated needs and usage signals: would the default app serve every need as it is, and how specialized are those needs on a four-level scale. Claude builds a personal spec only if the chance that the default fits is below 0.5 or the specialization score is 1.5 or higher. Otherwise the person stays on the default, and **Personalize anyway** skips the gate.

This saves money. Most people should never trigger a Claude run, and the check that decides costs one Jev call.

### Claude runs

`@malleable/builder-claude` runs Claude through the Claude Agent SDK with every built-in tool turned off. Claude sees only the library's tools: reading the person's data, the component library, the kit and design references, and the Pattern Atlas, plus tools that validate before they write. Each run is capped at 40 turns and $6, and each person can have one run at a time.

- **Personalize** designs a spec from the person's needs, usage signals, and data, then saves it with `submit_spec`.
- **Extend** handles a flagged request. If existing components can answer it in a new or changed view, Claude only patches the spec with `submit_spec_patch`. If a `param` prop lacks the value asked for, it adds an option with `add_option`. Otherwise Claude writes a new component with `write_component` first, then adds it to the spec. For an unmatched prop on a generated component, Claude rewrites that component under the same id with the missing options added. `write_component` rejects a rewrite that drops any audience, prop or option, because other specs may use them.

When a write tool rejects its input, it returns the errors to Claude, which fixes them and calls the tool again.

### Validating generated components

`write_component` runs three steps before it installs a component, all in `@malleable/verify`:

1. **Static checks** on the syntax tree. The module imports only `react`, `motion/react`, and `@kit`. It references no globals outside an allowlist (no `window`, `document`, `fetch`, `eval`, or storage APIs) and none of the properties that reach them. It default-exports a function component, and it contains no raw colour values.
2. **Compile** with esbuild to one ES module. Its imports resolve through a lookup the host page provides, so the module uses the app's own React.
3. **Verify** in headless Chrome. Generated code never runs in the server process.

Verification renders every prop option for every sample person whose audience can use the component, with `renderToString` and on the client, in the light and dark themes, at desktop width. It also renders the defaults at phone width and after clicking up to six of the component's controls. For each piece of text, it compares the text colour, with all opacity applied, against a screenshot of what is painted behind the text. It rejects the component if it throws, renders no text, or has text that falls below WCAG AA contrast (4.5:1, or 3:1 for large text), overlaps other text, renders under 10px, or sets a `fill` attribute on SVG text that the stylesheet overrides. The errors name the text, both colours, the theme and the props, so Claude can fix them and try again.

Two things make the audit easy to pass. The kit's `heat(t)` returns a fill for a mark and an ink for text on that mark, and every pair is at least 4.5:1 in both themes. And `web/src/kit/DESIGN.md` lists the only safe pairs of text and background colours. As a last resort, `Region` wraps each generated component in a guard that re-measures text whenever the component changes, scrolls, resizes or switches theme, recolours any label below AA, and logs a warning.

A component that passes is stored under the content hash of its compiled module and served from `GET /api/malleable/components/:id.:hash.js` as immutable. It starts out private: only the person whose request produced it can use it. Someone allowed to promote, Dr. Okafor in the demo, can share it with everyone from the panel's **Library** tab. Kit functions that change data, such as submitting a plan, are wrapped with `action()`, so they only run in response to a click or key press. The contract generated components follow is in `web/src/kit/KIT.md`.

These checks are not a sandbox. Generated components run in the same page as the app.

## Run it locally

You need:

- Nix with flakes enabled, which provides Bun and Node from `flake.nix`. You can also install Bun 1.4 yourself.
- A TypeSafe API key from [the TypeSafe console](https://console.typesafe.ai/keys).
- Claude credentials: either an `ANTHROPIC_API_KEY` or a logged-in Claude Code install.
- Google Chrome or Chromium for verification. On macOS the installed Google Chrome is found automatically. On Linux the Nix dev shell provides Chromium. Without a browser, Claude cannot install generated components.

1. Copy the example environment file and set `TYPESAFE_API_KEY` in it:

	```sh
	cp .env.example .env.local
	```

2. Enter the dev shell. With direnv, run `direnv allow`. It loads the flake and `.env.local`. Without direnv, run `nix develop`.

3. Install dependencies and start both servers:

	```sh
	bun install
	bun run dev
	```

	The API server logs `course planner server on http://localhost:8787  decider=jev-latest builder=claude-opus-5-5`, and Vite serves the app on port 5173.

4. Open <http://localhost:5173>.

If you have personal specs and generated components from before the library, in `apps/course-planner/data/runtime/`, run `bun run import-legacy` in `apps/course-planner` once to convert them into `data/store/`.

## Try the demo

The right-hand **Pipeline** panel shows what each model did. The **Activity** tab streams every Jev decision and every Claude tool call. The cost table at the top totals calls, median time, and spend per model.

1. With Maya selected, ask "Show my week". Jev picks the view, the layout, and the adaptive props from the default spec.
2. Click **Personalize**. Jev runs the gate, then Claude designs Maya's spec. Follow the run in **Activity**. When it finishes, the new spec loads and the changed slots are highlighted.
3. Ask "Show how prerequisites chain from what I've taken to the capstone". No view in a fresh setup can show that, so Jev flags it and shows the closest view. Click **Build it with Claude** to have Claude write a new component and add a view for it.
4. Switch **Device** to phone in the panel. Jev serves the same request again for a narrow screen.
5. Switch to Sam and click **Personalize**. Sam's needs match the default, so Jev is expected to keep the shared default and skip Claude.

Each person's suggestion chips include requests that no spec covers yet. For Dr. Okafor, try the heatmap of advisees' planned classes.

To start over for one person, click the reset button at the top of the panel, such as **Reset Maya**. It deletes that person's personal spec and clears their activity.

## Reference

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | none, required | Authenticates Jev calls. |
| `ANTHROPIC_API_KEY` | Claude Code login | Authenticates Claude runs. |
| `JEV_MODEL` | `jev-latest` | Model for serving and the gate. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for both kinds of Claude run. |
| `CLAUDE_PERSONALIZE_EFFORT` | `medium` | Reasoning effort for personalize runs. |
| `CLAUDE_EXTEND_EFFORT` | `high` | Reasoning effort for extend runs. |
| `PORT` | `8787` | API server port. The Vite proxy in `vite.config.ts` expects 8787. |
| `MALLEABLE_STORE` | `apps/course-planner/data/store` | Where specs, generated components and their compiled modules are kept. |
| `DEBUG_AGENT` | unset | Logs the agent's MCP server status and tool list at startup. |
| `CHROME_PATH` | detected | Browser executable for verification. |

The Jev cost in the panel is an estimate at $0.042 per million input tokens, set in `@malleable/decider-typesafe`.

### Scripts

At the repo root:

| Command | What it does |
| --- | --- |
| `bun run dev` | Starts the course planner's API server and Vite together. |
| `bun run typecheck` | Runs `tsc --noEmit` over the packages and the app. |
| `bun run test` | Runs the library's unit tests. |

In `apps/course-planner`:

| Command | What it does |
| --- | --- |
| `bun run server` | Starts only the API server. |
| `bun run web` | Starts only Vite. |
| `bun run build` | Builds the frontend. |
| `bun run eval` | Serves 24 labelled requests and reports how many views, props and gap flags Jev gets right. Calls Jev only. |
| `bun run contrast [id ...]` | Verifies every builtin and generated component. Without ids, it also self-tests the audit and the runtime guard against `scripts/fixtures/illegible.tsx`. |
| `bun run import-legacy` | Converts the pre-library `data/runtime/` into `data/store/`. |
| `bun run atlas` | Regenerates `data/atlas.json` from `Pattern Atlas.html`. |

These scripts call the real models from the command line, bill your keys, and do not need the web app:

- `bun run scripts/try-jev.ts` runs the gate for every person, then serves a few requests.
- `bun run scripts/try-personalize.ts [personId]` runs a personalize run without the gate. It saves a new spec.
- `bun run scripts/try-extend.ts [personId] [request]` serves the request and, if Jev flags it, runs an extend run on it. It can install a component and save a new spec.

### HTTP API

`@malleable/server`'s handler is mounted at `/api/malleable`. Every route acts for the person the session cookie names and returns 401 without one.

| Route | Purpose |
| --- | --- |
| `GET /spec?region=&version=` | The person's spec for a region, the component definitions they can use, and the version history. With `version`, one earlier version. |
| `POST /serve` | Serves a request. Body: `region`, `request`, `context` (an object of context keys and values), and optional `currentView`, `forceView` and `slot`. |
| `POST /personalize` | Runs the gate and, if it passes or `force` is true, starts a personalize run. |
| `POST /extend` | Starts an extend run for a flagged decision. Body: `decisionId`. |
| `POST /reset` | Deletes the person's personal spec. |
| `GET /review` | Private generated components waiting for promotion, for people who may promote. |
| `POST /promote` | Shares a private generated component with everyone. |
| `GET /components/:id.:hash.js` | A compiled generated component. |
| `GET /events` | Server-sent events for the person only. |

The demo adds two routes of its own: `GET /api/bootstrap` returns the people and the model config, and `POST /api/session` with `{ userId }` sets the session cookie, which is how the person switcher signs in.

`/personalize`, `/extend` and `/reset` return 409 while a Claude run is in progress for that person. Events are kept in memory, capped at 2,000, and lost when the server restarts. Specs and generated components persist on disk in `apps/course-planner/data/store/`, which git ignores.

### Repo layout

```
docs/library-design.md    the library's design
packages/
	core/                 definitions, spec schema and checks, migrations, decider questions, protocol
	react/                provider, Region, hooks, implement, action
	server/               createMalleable, routes, builder prompts and tools, storage, events
	verify/               static checks, compiler, verification in headless Chrome
	decider-typesafe/     Jev adapter
	builder-claude/       Claude Agent SDK adapter
	devtools/             Pipeline panel
	eval/                 labelled-request runner
apps/course-planner/
	data/
		atlas.json        Pattern Atlas entries Claude picks patterns from
		specs/default.json
		store/            personal specs and generated components (git-ignored)
	server/
		malleable.ts      the library's configuration for this app
		index.ts          HTTP server
		design.ts         the design contract
		atlas.ts          the Pattern Atlas as a catalog plugin
		user.ts           what the models know about each person
	shared/
		library.ts        builtin component definitions
		personas.ts       the three demo people
		data.ts           course, section, and student data
	web/src/
		components/       builtin components
		kit/              @kit, KIT.md, DESIGN.md, and the fixture provider for verification
		frames.tsx        how the app animates and labels slots
	scripts/              dev runner, eval, contrast check, legacy import, atlas extraction, manual model checks
```
