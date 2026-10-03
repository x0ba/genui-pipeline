var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// malleable-host:motion/react
var require_react = __commonJS({
  "malleable-host:motion/react"(exports, module) {
    module.exports = globalThis.__MALLEABLE_HOST__.require("motion/react");
  }
});

// malleable-host:react
var require_react2 = __commonJS({
  "malleable-host:react"(exports, module) {
    module.exports = globalThis.__MALLEABLE_HOST__.require("react");
  }
});

// malleable-host:@kit
var require_kit = __commonJS({
  "malleable-host:@kit"(exports, module) {
    module.exports = globalThis.__MALLEABLE_HOST__.require("@kit");
  }
});

// malleable-host:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "malleable-host:react/jsx-runtime"(exports, module) {
    module.exports = globalThis.__MALLEABLE_HOST__.require("react/jsx-runtime");
  }
});

// component.tsx
var import_react = __toESM(require_react());
var import_react2 = __toESM(require_react2());
var import_kit = __toESM(require_kit());
var import_jsx_runtime = __toESM(require_jsx_runtime());
var INF = 24 * 60 + 1;
var SPLITS = {
  "am-pm": [
    { key: "am", label: "AM", range: "before noon", lo: 0, hi: 720 },
    { key: "pm", label: "PM", range: "noon or later", lo: 720, hi: INF }
  ],
  "three-periods": [
    { key: "morning", label: "Morning", range: "before noon", lo: 0, hi: 720 },
    { key: "afternoon", label: "Afternoon", range: "noon to 5 PM", lo: 720, hi: 1020 },
    { key: "evening", label: "Evening", range: "5 PM or later", lo: 1020, hi: INF }
  ],
  "four-ranges": [
    { key: "early", label: "Before 10 AM", range: "start before 10 AM", lo: 0, hi: 600 },
    { key: "late-morning", label: "10 AM\u2013noon", range: "start 10 AM to noon", lo: 600, hi: 720 },
    { key: "early-afternoon", label: "Noon\u20133 PM", range: "start noon to 3 PM", lo: 720, hi: 900 },
    { key: "late", label: "3 PM or later", range: "start 3 PM or later", lo: 900, hi: INF }
  ],
  "cutoff-10am": [
    { key: "before", label: "Before 10 AM", range: "start before 10 AM", lo: 0, hi: 600 },
    { key: "after", label: "10 AM or later", range: "start 10 AM or later", lo: 600, hi: INF }
  ],
  "cutoff-2pm": [
    { key: "before", label: "Before 2 PM", range: "start before 2 PM", lo: 0, hi: 840 },
    { key: "after", label: "2 PM or later", range: "start 2 PM or later", lo: 840, hi: INF }
  ],
  "cutoff-5pm": [
    { key: "before", label: "Before 5 PM", range: "start before 5 PM", lo: 0, hi: 1020 },
    { key: "after", label: "5 PM or later", range: "start 5 PM or later", lo: 1020, hi: INF }
  ]
};
var COLORS = ["var(--vbg-chart-1)", "var(--vbg-chart-2)", "var(--vbg-chart-3)", "var(--vbg-chart-4)"];
var MARKS = [
  { key: "pie", label: "Pie" },
  { key: "donut", label: "Donut" },
  { key: "bars", label: "Bars" }
];
var W = 360;
var PH = 190;
var CX = 90;
var CY = PH / 2;
var R = 78;
var RI = 46;
function pt(r, a) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function slicePath(a0, a1, inner) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const outer = `M ${CX - R} ${CY} A ${R} ${R} 0 1 1 ${CX + R} ${CY} A ${R} ${R} 0 1 1 ${CX - R} ${CY} Z`;
    if (!inner) return outer;
    return `${outer} M ${CX - inner} ${CY} A ${inner} ${inner} 0 1 0 ${CX + inner} ${CY} A ${inner} ${inner} 0 1 0 ${CX - inner} ${CY} Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(R, a0);
  const [x1, y1] = pt(R, a1);
  if (!inner) return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
  const [ix1, iy1] = pt(inner, a1);
  const [ix0, iy0] = pt(inner, a0);
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0} Z`;
}
function StartTimeSplitChart(props) {
  const subject = (0, import_kit.useSubject)();
  const student = subject.kind === "student" ? subject.student : null;
  const splitKey = SPLITS[props.split] ? props.split : "am-pm";
  const scope = props.scope ?? "all";
  const initialMark = MARKS.some((m) => m.key === props.markType) ? props.markType : "pie";
  const [mark, setMark] = (0, import_react2.useState)(initialMark);
  (0, import_react2.useEffect)(() => setMark(initialMark), [initialMark]);
  const bins = SPLITS[splitKey];
  const { rows, total, unscheduled } = (0, import_react2.useMemo)(() => {
    const remaining = /* @__PURE__ */ new Set();
    if (student) for (const r of (0, import_kit.requirementStatus)(student)) for (const c of r.remaining) remaining.add(c);
    let pool = import_kit.sections;
    if (scope === "planned") {
      pool = student ? student.planned.map((id) => import_kit.sectionById.get(id)).filter(Boolean) : [];
    }
    const counts = bins.map(() => 0);
    let unscheduled2 = 0;
    for (const s of pool) {
      const c = import_kit.courseByCode.get(s.course);
      if (scope === "cs" && (!c || c.dept !== "CS")) continue;
      if (scope === "remaining" && !remaining.has(s.course)) continue;
      if (scope === "open" && s.enrolled >= s.capacity) continue;
      if (!s.meeting || !s.meeting.days || s.meeting.days.length === 0) {
        unscheduled2++;
        continue;
      }
      const i = bins.findIndex((b) => s.meeting.start >= b.lo && s.meeting.start < b.hi);
      if (i >= 0) counts[i]++;
    }
    const rows2 = bins.map((b, i) => ({ ...b, value: counts[i], color: COLORS[i % COLORS.length] }));
    return { rows: rows2, total: counts.reduce((a, b) => a + b, 0), unscheduled: unscheduled2 };
  }, [student, scope, bins]);
  const scopeText = scope === "planned" ? "planned " : scope === "cs" ? "computer science " : scope === "remaining" ? "remaining-requirement " : scope === "open" ? "open " : "";
  const top = [...rows].sort((a, b) => b.value - a.value)[0];
  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });
  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const barX = 110;
  const barW = 170;
  const barsH = 16 + rows.length * 38;
  const keyTop = CY - rows.length * 40 / 2;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-custom-actions", role: "group", "aria-label": "Chart type", children: MARKS.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "vbg-custom-text-button",
        "aria-pressed": mark === m.key,
        onClick: () => setMark(m.key),
        style: { textDecoration: mark === m.key ? "underline" : "none", textUnderlineOffset: 4 },
        children: m.label
      },
      m.key
    )) }),
    total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-meta", children: [
      "No ",
      scopeText,
      "sections meet at a set time this term."
    ] }) : mark === "bars" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} ${barsH}`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `Bar chart of ${scopeText}sections by start time: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`, children: [
      rows.map((r, i) => {
        const y = 10 + i * 38;
        const w = r.value / maxVal * barW;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: 0, y: y + 14, className: "vbg-meta", children: r.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.rect, { x: barX, y, height: 20, rx: 2, fill: r.color, initial: false, animate: { width: Math.max(w, r.value ? 2 : 0) }, transition: { type: "spring", stiffness: 200, damping: 30 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: barX + w + 6, y: y + 14, className: "vbg-meta", children: [
            r.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(r.value / total)
          ] })
        ] }, r.key);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: barX, x2: barX, y1: 4, y2: barsH - 4, stroke: "var(--vbg-border-default)" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} ${PH}`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `${mark === "donut" ? "Donut" : "Pie"} chart of ${scopeText}sections by start time: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`, children: [
      slices.map(
        (s) => s.value > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.path, { d: slicePath(s.a0, s.a1, mark === "donut" ? RI : 0), fill: s.color, fillRule: "evenodd", stroke: "var(--vbg-surface-primary)", strokeWidth: 2, initial: false, animate: { d: slicePath(s.a0, s.a1, mark === "donut" ? RI : 0) } }, s.key) : null
      ),
      mark === "donut" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: CX, y: CY, textAnchor: "middle", className: "vbg-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: CX, dy: -2, children: total }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: CX, dy: 14, children: "sections" })
      ] }),
      rows.map((r, i) => {
        const y = keyTop + i * 40;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: 196, y: y + 4, width: 12, height: 12, rx: 2, fill: r.color }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: 216, y: y + 14, className: "vbg-meta", children: r.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: 216, y: y + 30, className: "vbg-meta", children: [
            r.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(r.value / total)
          ] })
        ] }, r.key);
      })
    ] }),
    total > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Start time" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Sections" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Share" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { scope: "row", children: [
          r.label,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", children: r.range })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: r.value }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: (0, import_kit.fmtPct)(r.value / total) })
      ] }, r.key)) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "vbg-caption", children: [
      total > 0 ? `${top.label} has the most ${scopeText}sections: ${top.value} of ${total} (${(0, import_kit.fmtPct)(top.value / total)}). ` : "",
      "Each section counts once, by its start time.",
      unscheduled > 0 ? ` ${(0, import_kit.plural)(unscheduled, "section")} without a set meeting time ${unscheduled === 1 ? "is" : "are"} left out.` : ""
    ] })
  ] });
}
export {
  StartTimeSplitChart as default
};
