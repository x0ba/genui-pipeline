import type { ComponentDef } from "./component";
import { binaryQ, checkAnswers, choiceQ, scoreQ, type Answer, type Question } from "./decider";
import { criteriaOf, resolveKeys } from "./resolve";
import type { RegionInfo, RegionSpec, Slot, View } from "./spec";

// Question building for serving a request and for the personalization gate.
// The prompts are templates: the app supplies its domain, context
// descriptions, examples and thresholds, and no words about any one app remain here.

export type PromptSettings = {
  /** Conditions people put in requests, for the gap question: "a subject area, seat availability or a time". */
  conditions?: string;
  /** Requests that only want some items: "courses that are still available or that start after noon". */
  narrowing?: string;
  /** Ways the app's lists can be narrowed: "subject area or seat availability". */
  filters?: string;
  /** Who a typical person is, for the gate: "student". */
  typicalUser?: string;
  /** The gate's four specialization levels, from typical to a different job altogether. */
  specialization?: [string, string, string, string];
};

export type Thresholds = {
  /** Gap probability at or above which a request is flagged. */
  gap: number;
  /** Specialization score at or above which the gate hands off to the builder. */
  specialization: number;
  /** Probability that the default fits below which the gate hands off to the builder. */
  defaultFits: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = { gap: 0.5, specialization: 1.5, defaultFits: 0.5 };

export const DEFAULT_SPECIALIZATION: [string, string, string, string] = [
  "Typical: the person's needs match what most people do with the app",
  "Mild preferences the default ignores, such as a preferred sort order",
  "Hard constraints or habits the default cannot express, such as a fixed schedule or mostly using a phone",
  "A different job altogether, such as managing many other people's records",
];

export const NONE = "none-of-these";

/** A prop of the served view whose options all miss what the request asks for. */
export type Unmatched = { slotId: string; component: string; prop: string; label: string; options: string[]; probability: number };

export type Gap = { flagged: boolean; probability: number; kind: string; unmatched: Unmatched[] };

/** What the decider decided for one request. */
export type Decision = {
  id: string;
  userId: string;
  region: string;
  specVersion: number;
  request: string;
  view: string;
  viewConfidence: number;
  viewProbabilities: Record<string, number>;
  viewTitles: Record<string, string>;
  layout: string;
  /** slotId -> prop -> option key. */
  props: Record<string, Record<string, string>>;
  propConfidence: Record<string, Record<string, number>>;
  /** Set when the request was about one slot: its props apply whether adaptive or fixed. */
  slot?: string;
  gap: Gap | null;
  /** Answers the decider gave that were not among the options, and what replaced them. */
  invalid: string[];
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  model: string;
  questionCount: number;
};

export type DecisionCore = Omit<Decision, "id" | "userId" | "specVersion" | "latencyMs" | "inputTokens" | "costUsd" | "model">;

const describe = (library: Record<string, ComponentDef>, s: Slot) => library[s.component]?.description ?? s.component;

/** The views and what they show, for the gate. */
export function describeViews(views: View[], library: Record<string, ComponentDef>) {
  return views.map((v) => ({
    view: v.title,
    for: v.purpose,
    ...(v.audiences ? { shown_to: v.audiences } : {}),
    shows: v.slots.map((s) => describe(library, s)),
  }));
}

/** Like describeViews, plus every prop option a view can take, so the decider can tell a filter the view has from one it would need. */
function describeCapabilities(views: View[], library: Record<string, ComponentDef>) {
  return views.map((v) => ({
    view: v.title,
    for: v.purpose,
    parts: v.slots.flatMap((s) => {
      const def = library[s.component];
      if (!def) return [];
      const resolved = resolveKeys(def, s);
      const adjustable = s.adaptive.filter((k) => def.props[k]);
      const fixed = Object.keys(def.props).filter((k) => !adjustable.includes(k));
      return [
        {
          shows: def.description,
          ...(adjustable.length
            ? { adjustable: Object.fromEntries(adjustable.map((k) => [def.props[k]!.label, Object.values(criteriaOf(def, s, k))])) }
            : {}),
          ...(fixed.length ? { fixed: Object.fromEntries(fixed.map((k) => [def.props[k]!.label, criteriaOf(def, s, k)[resolved[k]!]])) } : {}),
        },
      ];
    }),
  }));
}

const GAP_KINDS = (p: PromptSettings) => ({
  "new-visualization": "A chart, diagram, map or other visual encoding the app does not have",
  "new-data-view": "A table, list or summary of data the app does not show",
  "new-filter": `A way to narrow or order a list the app already shows${p.filters ? `, such as by ${p.filters},` : ""} that the list does not offer`,
  "new-action": "An action or workflow the app does not support",
  "new-option":
    "A view has the right setting, such as its ranges, groups, filter or chart type, but none of that setting's options is the particular one the request asks for",
  "nothing-missing": "Nothing is missing",
});

function missQuestion(def: ComponentDef, slot: Slot, key: string): Question {
  const label = def.props[key]!.label.toLowerCase();
  return binaryQ(
    {
      question: `The "${def.title}" shows: ${def.description} Its ${label} can only be one of \`options\`; its other settings, in \`other_settings\`, handle other conditions. Consider only the part of \`request\` that is about ${label}: does it ask for a particular ${label} that none of \`options\` gives? Compare every value it states, such as ranges, groups, cut-offs, periods or items, with what each option shows.`,
      options: Object.values(criteriaOf(def, slot, key)),
      other_settings: Object.fromEntries(
        Object.keys(def.props)
          .filter((k) => k !== key)
          .map((k) => [def.props[k]!.label, Object.values(criteriaOf(def, slot, k))]),
      ),
    },
    {
      true: `The request states a ${label}, and it differs from every option, such as other ranges or other groups than any option lists`,
      false: `One option gives exactly what the request asks for, the request says nothing about ${label}, or its conditions belong to another setting`,
    },
  );
}

type PropKey = { slotId: string; prop: string; viewId: string; component: string; label: string; options: string[]; default: string };

export type ServeInput = {
  region: RegionInfo;
  /** The region's views, already filtered to the person's audience. */
  views: View[];
  home: string;
  library: Record<string, ComponentDef>;
  profile: string;
  audience?: string | null;
  request: string;
  /** Context key -> the server's description of the chosen option. */
  context: Record<string, string>;
  currentView?: string;
  /** Navigation: the person picked the view; the decider still picks its props and layout. */
  forceView?: string;
  /** A request about one slot of the current view: only that slot's props are asked about. */
  slot?: string;
  prompts?: PromptSettings;
  thresholds?: Thresholds;
};

export type ServePlan = {
  state: Record<string, unknown>;
  questions: Record<string, Question>;
  read(answers: Record<string, Answer | undefined>): DecisionCore;
};

export function planServe(input: ServeInput): ServePlan {
  const { views, library, region } = input;
  const p = input.prompts ?? {};
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const request = input.request.trim();
  const current = views.find((v) => v.id === input.currentView);
  const focus = input.slot ? current?.slots.find((s) => s.id === input.slot) : undefined;
  if (input.slot && !focus) throw new Error(`slot '${input.slot}' is not in the current view`);

  const state = {
    user: input.profile,
    ...(input.audience ? { role: input.audience } : {}),
    context: { ...input.context, current_view: current?.title ?? "none, the app was just opened" },
    request: request || "Open the app. No specific request.",
  };

  const questions: Record<string, Question> = {};
  const fallbacks: Record<string, string> = {};
  const propKeys = new Map<string, PropKey>();

  const addProp = (view: View, slot: Slot, key: string, withMiss: boolean) => {
    const def = library[slot.component];
    const prop = def?.props[key];
    if (!def || !prop) return;
    const qid = `p${propKeys.size}`;
    const criteria = criteriaOf(def, slot, key);
    propKeys.set(qid, { slotId: slot.id, prop: key, viewId: view.id, component: def.id, label: prop.label, options: Object.keys(criteria), default: resolveKeys(def, slot)[key]! });
    fallbacks[qid] = resolveKeys(def, slot)[key]!;
    questions[qid] = choiceQ(
      {
        question: `In the "${view.title}" view, the "${def.title}" shows: ${def.description} Which ${prop.label.toLowerCase()} best serves \`request\` for this \`user\` in this \`context\`?`,
      },
      criteria,
    );
    // The choice above always rounds to the nearest option, so a view that fits
    // but lacks the exact value asked for would otherwise never be flagged.
    if (withMiss) questions[`${qid}_miss`] = missQuestion(def, slot, key);
  };

  if (focus && current) {
    const def = library[focus.component];
    questions.gap = binaryQ(
      {
        question: `Does \`request\` ask the "${def?.title ?? focus.component}" for something, such as information, a filter, a sort order, a visualization or an action, that none of its settings in \`settings\` can provide?`,
        shows: def?.description ?? focus.component,
        settings: def ? Object.fromEntries(Object.keys(def.props).map((k) => [def.props[k]!.label, Object.values(criteriaOf(def, focus, k))])) : {},
      },
      {
        true: "The request needs something none of the component's settings provides",
        false: "One option of each setting the request is about covers it",
      },
    );
    questions.gap_kind = choiceQ("If `request` needs something the component does not provide, what kind of thing is missing?", GAP_KINDS(p));
    for (const key of Object.keys(def?.props ?? {})) addProp(current, focus, key, request !== "");
  } else {
    const mainContent = (v: View) =>
      v.slots
        .filter((s) => s.area === region.primary)
        .map((s) => describe(library, s))
        .join(" ");
    questions.view = choiceQ(
      "Which view of the app should be shown to answer `request` for this `user`? Pick the view whose main content is the kind of thing the request asks for: a request for a list goes to a view whose main content is a list, a request for a chart to a view whose main content is a chart.",
      {
        ...Object.fromEntries(views.map((v) => [v.id, `${v.title}: ${v.purpose} Main content: ${mainContent(v)}`])),
        // Opening the app always has an answer; only real requests can miss.
        ...(request ? { [NONE]: "None of these views shows what the request asks for" } : {}),
      },
    );
    fallbacks.view = input.forceView ?? current?.id ?? input.home;
    questions.gap = binaryQ(
      {
        question: `Does \`request\` ask for information, a filter, a sort order, a visualization or an action that none of the views in \`available_views\` can provide? A view can only be changed through its \`adjustable\` options; its \`fixed\` options never change. Every condition in the request counts${p.conditions ? `, such as ${p.conditions}` : ""}. Sorting is not filtering: a request to show only some items${p.narrowing ? `, such as ${p.narrowing},` : ""} needs an option that removes the other items; an option that only reorders them does not cover it.`,
        available_views: describeCapabilities(views, library),
      },
      {
        true: "The request needs something no view provides: a missing diagram, chart or data view, or a filter or sort order that no view's `adjustable` or `fixed` options include",
        false: "One view covers every condition in the request with its listed options, or the request is simply opening the app",
      },
    );
    questions.gap_kind = choiceQ("If `request` needs something no view provides, what kind of thing is missing?", GAP_KINDS(p));
    questions.layout = choiceQ(
      "Which page layout best fits the device in `context` and the request?",
      Object.fromEntries(region.layouts.map((l) => [l.id, l.description])),
    );
    fallbacks.layout = (current ?? views.find((v) => v.id === input.home))?.layout ?? region.layouts[0]!.id;
    // Speculative fan-out: ask about every adaptive prop in every view in the
    // same call and keep only the answers for the view the decider picks.
    // Only main content gets a miss question: requests are about it, and
    // asking about every panel flags settings the request never mentions.
    for (const view of views)
      for (const slot of view.slots) for (const key of slot.adaptive) addProp(view, slot, key, request !== "" && slot.area === region.primary);
  }

  return {
    state,
    questions,
    read(raw) {
      const { answers, invalid } = checkAnswers(questions, raw, fallbacks);
      const choiceOf = (id: string) => answers[id] as Extract<Answer, { kind: "choice" }> | undefined;
      const prob = (id: string) => (answers[id] as Extract<Answer, { kind: "binary" }> | undefined)?.probability ?? 0;

      let viewId: string;
      let viewConfidence = 1;
      let viewProbabilities: Record<string, number> = {};
      let layout: string;
      if (focus && current) {
        viewId = current.id;
        viewProbabilities = { [current.id]: 1 };
        layout = current.layout;
      } else {
        const v = choiceOf("view")!;
        viewConfidence = v.confidence;
        viewProbabilities = v.probabilities;
        viewId = input.forceView && views.some((x) => x.id === input.forceView) ? input.forceView : v.choice;
        if (viewId === NONE || !views.some((x) => x.id === viewId))
          // Show the closest view the spec does have while the gap is handled.
          viewId =
            Object.entries(v.probabilities)
              .filter(([id]) => id !== NONE)
              .sort((a, b) => b[1] - a[1])[0]?.[0] ?? input.home;
        layout = choiceOf("layout")!.choice;
      }

      const props: Decision["props"] = {};
      const propConfidence: Decision["propConfidence"] = {};
      const unmatched: Unmatched[] = [];
      for (const [qid, key] of propKeys) {
        if (key.viewId !== viewId) continue;
        const a = choiceOf(qid)!;
        (props[key.slotId] ??= {})[key.prop] = a.choice;
        (propConfidence[key.slotId] ??= {})[key.prop] = a.confidence;
        const missP = questions[`${qid}_miss`] ? prob(`${qid}_miss`) : 0;
        if (missP >= t.gap)
          unmatched.push({ slotId: key.slotId, component: key.component, prop: key.prop, label: key.label, options: key.options, probability: missP });
      }

      const gapP = prob("gap");
      const unmatchedP = Math.max(0, ...unmatched.map((u) => u.probability));
      // The view-level question catches whole missing views; the per-prop ones
      // catch a view that fits but lacks the exact option.
      const flagged = !input.forceView && request !== "" && (gapP >= t.gap || unmatched.length > 0);
      const kind = gapP < t.gap && unmatched.length ? "new-option" : choiceOf("gap_kind")!.choice;

      return {
        region: region.name,
        request: state.request,
        view: viewId,
        viewConfidence,
        viewProbabilities,
        viewTitles: Object.fromEntries(views.map((v) => [v.id, v.title])),
        layout,
        props,
        propConfidence,
        ...(focus ? { slot: focus.id } : {}),
        gap: { flagged, probability: Math.max(gapP, unmatchedP), kind, unmatched: flagged ? unmatched : [] },
        invalid,
        questionCount: Object.keys(questions).length,
      };
    },
  };
}

// ---------------------------------------------------------------- the gate

export type GateInput = {
  domain: string;
  needs: string;
  signals: string | string[];
  regionSpec: RegionSpec;
  library: Record<string, ComponentDef>;
  prompts?: PromptSettings;
  thresholds?: Thresholds;
};

export type GateResult = {
  defaultFits: number;
  specialization: { score: number; confidence: number; legend: Record<string, string> };
  personalize: boolean;
  invalid: string[];
};

/** Whether the shared default already serves this person. Only when it does not does the builder run. */
export function planGate(input: GateInput) {
  const p = input.prompts ?? {};
  const t = input.thresholds ?? DEFAULT_THRESHOLDS;
  const levels = p.specialization ?? DEFAULT_SPECIALIZATION;
  const state = {
    app: input.domain,
    user_needs: input.needs,
    usage_signals: input.signals,
    default_app: describeViews(input.regionSpec.views, input.library),
  };
  const questions: Record<string, Question> = {
    default_fits: binaryQ(
      "Would the app described in `default_app`, used exactly as it is, serve every need in `user_needs` and the habits in `usage_signals`?",
      {
        true: "Every need is served by an existing view without changes",
        false: "At least one need or habit is not served, or the person would work around the app",
      },
    ),
    specialization: scoreQ(`How specialized are this person's needs compared with a typical ${p.typicalUser ?? "person using the app"}?`, levels),
  };
  return {
    state,
    questions,
    read(raw: Record<string, Answer | undefined>): GateResult {
      const { answers, invalid } = checkAnswers(questions, raw);
      const defaultFits = (answers.default_fits as Extract<Answer, { kind: "binary" }>).probability;
      const s = answers.specialization as Extract<Answer, { kind: "score" }>;
      return {
        defaultFits,
        specialization: { score: s.score, confidence: s.confidence, legend: Object.fromEntries(levels.map((l, i) => [String(i), l])) },
        personalize: defaultFits < t.defaultFits || s.score >= t.specialization,
        invalid,
      };
    },
  };
}
