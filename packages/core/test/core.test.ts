import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  checkAnswers,
  checkSpec,
  choice,
  defineComponent,
  normalizeSpec,
  param,
  planServe,
  regionInfo,
  resolveKeys,
  resolveValues,
  serializeComponent,
  variantsOf,
  type ComponentDef,
  type PropsOf,
  type Spec,
} from "../src";

const gpaChart = defineComponent({
  id: "gpa-chart",
  title: "GPA distribution",
  description: "How the advisor's students are spread across GPA ranges.",
  audiences: ["advisor"],
  props: {
    mark: choice({ bar: "Bars side by side", pie: "Slices of one circle" }, { default: "bar" }),
    bins: param(z.array(z.number()).min(2), {
      options: {
        "whole-points": { value: [0, 1, 2, 3, 4], when: "Four ranges: 0–1, 1–2, 2–3 and 3–4" },
        halves: { value: [0, 2, 4], when: "Two ranges: 0–2 and 2–4" },
      },
      default: "whole-points",
    }),
  },
});

const search = defineComponent({
  id: "course-search",
  version: 2,
  title: "Course search",
  description: "Searchable list of courses.",
  props: {
    ranking: choice({ code: "By code", seats: "Most open seats first" }, { default: "code" }),
    grouping: choice({ none: "One list", department: "By department" }, { default: "none" }),
  },
  migrations: { 2: { renamed: { "props.ranking.open-seats": "seats" }, removed: { "props.grouping.time-of-day": "none", "props.legacy": null } } },
});

const library: Record<string, ComponentDef> = { [gpaChart.id]: gpaChart, [search.id]: search };
const dashboard = regionInfo("dashboard", {
  areas: ["top", "main", "aside"],
  default: { home: "a", views: [{ id: "a", title: "A", purpose: "A", layout: "stack", slots: [{ id: "s", component: "course-search", area: "main", props: {}, adaptive: [] }] }] },
});
const ctx = { library, regions: { dashboard }, audience: "advisor" };

const spec = (slots: Spec["regions"][string]["views"][number]["slots"]): Spec => ({
  id: "spec-x",
  version: 1,
  userId: "x",
  parent: null,
  profile: "",
  regions: { dashboard: { home: "v", views: [{ id: "v", title: "V", purpose: "V", layout: "main-aside", slots }] } },
  rationale: [],
  changelog: [],
});

describe("defineComponent", () => {
  test("labels props from their keys and types the implementation's props", () => {
    expect(gpaChart.props.bins.label).toBe("Bins");
    const props: PropsOf<typeof gpaChart> = { mark: "pie", bins: [0, 2, 4] };
    expect(props.mark).toBe("pie");
  });
  test("rejects one option, a default that is not an option, and values that do not parse", () => {
    expect(() =>
      defineComponent({ id: "x", title: "X", description: "X", props: { a: choice({ only: "Only" }, { default: "only" }) } }),
    ).toThrow("at least two options");
    expect(() =>
      defineComponent({ id: "x", title: "X", description: "X", props: { a: choice({ b: "B", c: "C" }, { default: "d" as "b" }) } }),
    ).toThrow("is not one of its options");
    expect(() =>
      defineComponent({
        id: "x",
        title: "X",
        description: "X",
        props: { a: param(z.number(), { options: { one: { value: 1, when: "One" }, bad: { value: "2" as unknown as number, when: "Two" } }, default: "one" }) },
      }),
    ).toThrow("value does not parse");
  });
  test("serializes zod schemas to JSON Schema that still validates", () => {
    const json = serializeComponent(gpaChart);
    const bins = json.props.bins!;
    expect(bins.kind).toBe("param");
    expect(typeof (bins as { schema: { safeParse?: unknown } }).schema.safeParse).toBe("undefined");
    const errors = checkSpec(
      spec([{ id: "g", component: "gpa-chart", area: "main", props: {}, adaptive: [], options: { bins: { one: { value: [1], when: "One edge" } } } }]),
      { ...ctx, library: { "gpa-chart": json } },
    );
    expect(errors.join()).toContain("value does not parse");
  });
});

describe("checkSpec and resolution", () => {
  test("accepts slot options for param props and resolves their values", () => {
    const s = spec([
      { id: "g", component: "gpa-chart", area: "main", props: { bins: "thirds" }, adaptive: ["mark"], options: { bins: { thirds: { value: [0, 1.33, 2.67, 4], when: "Three equal ranges" } } } },
    ]);
    expect(checkSpec(s, ctx)).toEqual([]);
    const slot = s.regions.dashboard!.views[0]!.slots[0]!;
    const keys = resolveKeys(gpaChart, slot, { mark: "pie", bins: "halves" });
    expect(keys).toEqual({ mark: "pie", bins: "thirds" });
    expect(resolveValues(gpaChart, slot, keys)).toEqual({ mark: "pie", bins: [0, 1.33, 2.67, 4] });
    expect(variantsOf(gpaChart, slot)).toHaveLength(4);
  });
  test("rejects options on choice props, unknown areas, audiences and layouts", () => {
    const errors = checkSpec(
      {
        ...spec([{ id: "g", component: "course-search", area: "side", props: {}, adaptive: [], options: { ranking: { x: { value: 1, when: "X" } } } }]),
      },
      { ...ctx, audience: "student" },
    );
    expect(errors.join("\n")).toContain("area 'side'");
    expect(errors.join("\n")).toContain("only param props take extra options");
    const e2 = checkSpec(spec([{ id: "g", component: "gpa-chart", area: "main", props: {}, adaptive: [] }]), { ...ctx, audience: "student" });
    expect(e2.join()).toContain("does not support student data");
  });
});

describe("normalizeSpec", () => {
  test("applies migrations, then drops what still fails", () => {
    const s = spec([
      { id: "a", component: "course-search", area: "main", props: { ranking: "open-seats", grouping: "time-of-day", legacy: "x" }, adaptive: [] },
      { id: "b", component: "gone", area: "aside", props: {}, adaptive: [] },
    ]);
    const { spec: out, notes } = normalizeSpec(s, { ...ctx, defaults: {} });
    expect(out.regions.dashboard!.views[0]!.slots).toEqual([{ id: "a", component: "course-search", area: "main", props: { ranking: "seats", grouping: "none" }, adaptive: [] }]);
    expect(notes.some((n) => n.includes("dropped slot 'b'"))).toBe(true);
  });
  test("a region with no valid view falls back to the default", () => {
    const s = spec([{ id: "b", component: "gone", area: "aside", props: {}, adaptive: [] }]);
    const { spec: out } = normalizeSpec(s, { ...ctx, defaults: {} });
    expect(out.regions.dashboard).toBeUndefined();
  });
});

describe("answers", () => {
  test("an answer that is not one of the options is replaced and logged", () => {
    const { answers, invalid } = checkAnswers(
      { view: { kind: "choice", prompt: "?", options: { a: "A", b: "B" } }, gap: { kind: "binary", prompt: "?", true: "y", false: "n" } },
      { view: { kind: "choice", choice: "made-up", confidence: 1, probabilities: {} }, gap: { kind: "binary", probability: 7 } },
      { view: "b" },
    );
    expect(answers.view).toMatchObject({ choice: "b" });
    expect(answers.gap).toEqual({ kind: "binary", probability: 0 });
    expect(invalid).toHaveLength(2);
  });

  test("planServe asks one question per adaptive prop and a miss question in the primary area", () => {
    const views = spec([{ id: "g", component: "gpa-chart", area: "main", props: {}, adaptive: ["mark", "bins"] }]).regions.dashboard!.views;
    const plan = planServe({ region: dashboard, views, home: "v", library, profile: "", request: "pie of 0-2 and 2-4", context: { device: "a phone" } });
    expect(Object.keys(plan.questions).sort()).toEqual(["gap", "gap_kind", "layout", "p0", "p0_miss", "p1", "p1_miss", "view"]);
    const d = plan.read({
      view: { kind: "choice", choice: "v", confidence: 0.9, probabilities: { v: 0.9 } },
      layout: { kind: "choice", choice: "stack", confidence: 1, probabilities: {} },
      gap: { kind: "binary", probability: 0.1 },
      gap_kind: { kind: "choice", choice: "nothing-missing", confidence: 1, probabilities: {} },
      p0: { kind: "choice", choice: "pie", confidence: 1, probabilities: {} },
      p0_miss: { kind: "binary", probability: 0 },
      p1: { kind: "choice", choice: "halves", confidence: 1, probabilities: {} },
      p1_miss: { kind: "binary", probability: 0.8 },
    });
    expect(d.props).toEqual({ g: { mark: "pie", bins: "halves" } });
    expect(d.gap).toMatchObject({ flagged: true, kind: "new-option" });
    expect(d.gap!.unmatched.map((u) => u.prop)).toEqual(["bins"]);
  });

  test("a request about one slot asks only about that slot, fixed props included", () => {
    const views = spec([
      { id: "g", component: "gpa-chart", area: "main", props: { mark: "bar" }, adaptive: [] },
      { id: "s", component: "course-search", area: "aside", props: {}, adaptive: ["ranking"] },
    ]).regions.dashboard!.views;
    const plan = planServe({ region: dashboard, views, home: "v", library, profile: "", request: "make this a pie", context: {}, currentView: "v", slot: "g" });
    expect(plan.questions.view).toBeUndefined();
    const d = plan.read({ p0: { kind: "choice", choice: "pie", confidence: 1, probabilities: {} } });
    expect(d.slot).toBe("g");
    expect(d.props.g!.mark).toBe("pie");
    expect(d.props.s).toBeUndefined();
  });
});
