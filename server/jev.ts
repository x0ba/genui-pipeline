import { TypeSafeClient, choice, noul, score, type Questions } from "@typesafe-ai/sdk";
import { TERM } from "../shared/data";
import type { Persona } from "../shared/personas";
import {
  LAYOUT_CRITERIA,
  viewsFor,
  resolveProps,
  type ComponentDef,
  type Decision,
  type Layout,
  type ServeContext,
  type Spec,
  type View,
} from "../shared/spec";

// Jev is the System One model serving the UI: every call is a batch of Choice and
// Noul questions whose options come straight from the spec, so it can only ever
// answer with something the spec can render.

export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const GAP_THRESHOLD = 0.5;
const NONE = "none-of-these";

let client: TypeSafeClient | null = null;
function jev() {
  if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is not set. Add it to .env.local.");
  client ??= new TypeSafeClient({ defaultModel: JEV_MODEL, timeout: 15_000 });
  return client;
}

async function timed<T>(fn: () => Promise<T>) {
  const start = performance.now();
  const result = await fn();
  return { result, latencyMs: Math.round(performance.now() - start) };
}

// ---------------------------------------------------------------- 80/20 gate
const SPECIALIZATION = [
  "Typical: the person's needs match what most students do in a course catalog",
  "Mild preferences the default ignores, such as a preferred sort order",
  "Hard constraints or habits the default cannot express, such as a fixed work schedule or mostly using a phone",
  "A different job altogether, such as managing many other people's records",
] as const;

export function describeSpec(spec: Spec, library: Record<string, ComponentDef>) {
  return spec.views.map((v) => ({
    view: v.title,
    for: v.purpose,
    ...(v.roles ? { shown_to: v.roles } : {}),
    shows: v.slots.map((s) => library[s.component]?.description ?? s.component),
  }));
}

/** Like describeSpec, plus every prop option a view can take, so Jev can tell a
 * filter the view has from one it would need. */
function describeCapabilities(views: View[], library: Record<string, ComponentDef>) {
  return views.map((v) => ({
    view: v.title,
    for: v.purpose,
    parts: v.slots.flatMap((s) => {
      const def = library[s.component];
      if (!def) return [];
      const resolved = resolveProps(def, s);
      const adjustable = s.adaptive.filter((k) => def.props[k]);
      const fixed = Object.keys(def.props).filter((k) => !adjustable.includes(k));
      return [
        {
          shows: def.description,
          ...(adjustable.length
            ? { adjustable: Object.fromEntries(adjustable.map((k) => [def.props[k]!.label, Object.values(def.props[k]!.options)])) }
            : {}),
          ...(fixed.length
            ? { fixed: Object.fromEntries(fixed.map((k) => [def.props[k]!.label, def.props[k]!.options[resolved[k]!]])) }
            : {}),
        },
      ];
    }),
  }));
}

export async function gate(persona: Persona, defaultSpec: Spec, library: Record<string, ComponentDef>) {
  const { result, latencyMs } = await timed(() =>
    jev().systemOne({
      state: {
        user_needs: persona.intake,
        usage_signals: persona.signals,
        default_app: describeSpec(defaultSpec, library),
      },
      questions: {
        default_fits: noul(
          "Would the app described in `default_app`, used exactly as it is, serve every need in `user_needs` and the habits in `usage_signals`?",
          {
            true: "Every need is served by an existing view without changes",
            false: "At least one need or habit is not served, or the person would work around the app",
          },
        ),
        specialization: score("How specialized are this person's needs compared with a typical student?", SPECIALIZATION),
      },
    }),
  );
  const defaultFits = result.answers.default_fits.noul;
  const spec = result.answers.specialization;
  return {
    latencyMs,
    model: result.model,
    inputTokens: result.usage.input_tokens,
    costUsd: result.usage.input_tokens * USD_PER_INPUT_TOKEN,
    defaultFits,
    specialization: { score: spec.score, confidence: spec.confidence, legend: spec.legend as Record<string, string> },
    personalize: defaultFits < 0.5 || spec.score >= 1.5,
  };
}

// ---------------------------------------------------------------- serving
type PropKey = { slotId: string; prop: string; viewId: string };

export async function serve(opts: {
  userId: string;
  spec: Spec;
  role: "student" | "advisor";
  library: Record<string, ComponentDef>;
  request: string;
  context: ServeContext;
  currentView?: string;
  /** Navigation: the person picked the view, Jev still picks its props and layout. */
  forceView?: string;
}): Promise<Decision> {
  const { spec, library, request, context } = opts;
  const views = viewsFor(spec, opts.role);

  const questions: Questions = {
    view: choice(
      "Which view of the app should be shown to answer `request` for this `user`?",
      {
        ...Object.fromEntries(views.map((v) => [v.id, `${v.title}: ${v.purpose}`])),
        // Opening the app always has an answer; only real requests can miss.
        ...(request.trim() ? { [NONE]: "None of these views shows what the request asks for" } : {}),
      },
    ),
    gap: noul(
      {
        question:
          "Does `request` ask for information, a filter, a sort order, a visualization or an action that none of the views in `available_views` can provide? A view can only be changed through its `adjustable` options; its `fixed` options never change. Every condition in the request counts, such as a subject area, seat availability or a time.",
        available_views: describeCapabilities(views, library),
      },
      {
        true: "The request needs something no view provides: a missing diagram, chart or data view, or a filter or sort order that no view's `adjustable` or `fixed` options include",
        false: "One view covers every condition in the request with its listed options, or the request is simply opening the app",
      },
    ),
    gap_kind: choice("If `request` needs something no view provides, what kind of thing is missing?", {
      "new-visualization": "A chart, diagram, map or other visual encoding the app does not have",
      "new-data-view": "A table, list or summary of data the app does not show",
      "new-filter": "A way to narrow or order a list the app already shows, such as by subject area or seat availability, that the list does not offer",
      "new-action": "An action or workflow the app does not support",
      "nothing-missing": "Nothing is missing",
    }),
    layout: choice(
      "Which page layout best fits the device in `context` and the request?",
      LAYOUT_CRITERIA as Record<Layout, string>,
    ),
  };

  // Speculative fan-out: ask about every adaptive prop in every view in the same
  // call and keep only the answers for the view Jev picks. Extra questions are
  // evaluated in parallel and cost only their own tokens.
  const propKeys = new Map<string, PropKey>();
  for (const view of views) {
    for (const slot of view.slots) {
      const def = library[slot.component];
      if (!def) continue;
      for (const key of slot.adaptive) {
        const prop = def.props[key];
        if (!prop) continue;
        const qid = `p${propKeys.size}`;
        propKeys.set(qid, { slotId: slot.id, prop: key, viewId: view.id });
        questions[qid] = choice(
          {
            question: `In the "${view.title}" view, the "${def.title}" shows: ${def.description} Which ${prop.label.toLowerCase()} best serves \`request\` for this \`user\` in this \`context\`?`,
          },
          prop.options,
        );
      }
    }
  }

  const state = {
    user: spec.profile,
    role: opts.role,
    context: {
      device: context.device === "phone" ? "a phone with a narrow screen" : "a desktop computer with a wide screen",
      registration_phase: {
        planning: `Planning. Registration for ${TERM.name} opens on ${TERM.registrationOpens}.`,
        "registration-open": `Registration for ${TERM.name} is open now.`,
        "add-drop": `Add/drop period. It ends on ${TERM.addDropEnds}.`,
      }[context.phase],
      current_view: views.find((v) => v.id === opts.currentView)?.title ?? "none, the app was just opened",
    },
    request: request.trim() || "Open the app. No specific request.",
  };

  const { result, latencyMs } = await timed(() => jev().systemOne({ state, questions }));
  const answers = result.answers as Record<string, any>;

  const viewAnswer = answers.view as { choice: string; confidence: number; probabilities: Record<string, number> };
  let viewId = opts.forceView && views.some((v) => v.id === opts.forceView) ? opts.forceView : viewAnswer.choice;
  if (viewId === NONE || !views.some((v) => v.id === viewId)) {
    // Show the closest view the spec does have while the gap is handled.
    viewId =
      Object.entries(viewAnswer.probabilities)
        .filter(([id]) => id !== NONE)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? spec.home;
  }

  const props: Decision["props"] = {};
  const propConfidence: Decision["propConfidence"] = {};
  for (const [qid, key] of propKeys) {
    if (key.viewId !== viewId) continue;
    const a = answers[qid] as { choice: string; confidence: number };
    (props[key.slotId] ??= {})[key.prop] = a.choice;
    (propConfidence[key.slotId] ??= {})[key.prop] = a.confidence;
  }

  const gapP = answers.gap.noul as number;
  // The Noul alone decides gaps: it separates misses cleanly, while the view
  // Choice's "none" option is only used to fall back to the closest view.
  const flagged = !opts.forceView && request.trim() !== "" && gapP >= GAP_THRESHOLD;

  return {
    id: crypto.randomUUID(),
    userId: opts.userId,
    specVersion: spec.version,
    request: state.request,
    view: viewId,
    viewConfidence: viewAnswer.confidence,
    viewProbabilities: viewAnswer.probabilities,
    viewTitles: Object.fromEntries(views.map((v) => [v.id, v.title])),
    layout: answers.layout.choice as Layout,
    props,
    propConfidence,
    gap: { flagged, probability: gapP, kind: answers.gap_kind.choice },
    latencyMs,
    inputTokens: result.usage.input_tokens,
    costUsd: result.usage.input_tokens * USD_PER_INPUT_TOKEN,
    model: result.model,
    questionCount: Object.keys(questions).length,
  };
}
