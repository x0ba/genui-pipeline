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
var PERIODS = [
  { key: "morning", label: "Morning", range: "before noon", color: "var(--vbg-chart-1)" },
  { key: "afternoon", label: "Afternoon", range: "noon to 5pm", color: "var(--vbg-chart-2)" },
  { key: "evening", label: "Evening", range: "5pm or later", color: "var(--vbg-chart-3)" }
];
function periodOf(start) {
  if (start < 720) return "morning";
  if (start < 1020) return "afternoon";
  return "evening";
}
var W = 360;
var H = 250;
var CX = W / 2;
var CY = H / 2;
var R = 82;
var RI = 50;
function pt(r, a) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function slicePath(a0, a1, inner) {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  if (full) {
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
function TimeOfDayChart(props) {
  const subject = (0, import_kit.useSubject)();
  const markType = props.markType ?? "pie";
  const count = props.count ?? "courses";
  const scope = props.scope ?? "all";
  const student = subject.kind === "student" ? subject.student : null;
  const { rows, total, unscheduled, unit } = (0, import_react2.useMemo)(() => {
    const remaining = /* @__PURE__ */ new Set();
    if (student) for (const r of (0, import_kit.requirementStatus)(student)) for (const c of r.remaining) remaining.add(c);
    const sets = { morning: /* @__PURE__ */ new Set(), afternoon: /* @__PURE__ */ new Set(), evening: /* @__PURE__ */ new Set() };
    const secCounts = { morning: 0, afternoon: 0, evening: 0 };
    let unscheduled2 = 0;
    const allCourses = /* @__PURE__ */ new Set();
    for (const s of import_kit.sections) {
      const c = import_kit.courseByCode.get(s.course);
      if (scope === "cs" && (!c || c.dept !== "CS")) continue;
      if (scope === "remaining" && !remaining.has(s.course)) continue;
      if (scope === "open" && s.enrolled >= s.capacity) continue;
      if (!s.meeting || !s.meeting.days || s.meeting.days.length === 0) {
        unscheduled2++;
        continue;
      }
      const p = periodOf(s.meeting.start);
      sets[p].add(s.course);
      secCounts[p]++;
      allCourses.add(s.course);
    }
    const rows2 = PERIODS.map((p) => ({ ...p, value: count === "sections" ? secCounts[p.key] : sets[p.key].size }));
    const total2 = rows2.reduce((n, r) => n + r.value, 0);
    return { rows: rows2, total: total2, unscheduled: unscheduled2, unit: count === "sections" ? "section" : "course", distinct: allCourses.size };
  }, [student, scope, count]);
  const top = [...rows].sort((a, b) => b.value - a.value)[0];
  const scopeText = scope === "cs" ? "computer science " : scope === "remaining" ? "remaining-requirement " : scope === "open" ? "open " : "";
  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });
  const maxVal = Math.max(1, ...rows.map((r) => r.value));
  const barW = 200;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart", children: [
    total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-meta", children: [
      "No ",
      scopeText,
      unit,
      "s meet at a set time this term."
    ] }) : markType === "bars" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} 130`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `Number of ${scopeText}${unit}s starting in the morning, afternoon and evening`, children: [
      rows.map((r, i) => {
        const y = 14 + i * 38;
        const w = r.value / maxVal * barW;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: 0, y: y + 14, fill: "currentColor", className: "vbg-meta", children: r.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.rect, { x: 80, y, height: 20, rx: 2, fill: r.color, initial: false, animate: { width: Math.max(w, r.value ? 2 : 0) }, transition: { type: "spring", stiffness: 200, damping: 30 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: 80 + w + 6, y: y + 14, fill: "currentColor", className: "vbg-meta", children: [
            r.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(r.value / total)
          ] })
        ] }, r.key);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: 80, x2: 80, y1: 6, y2: 124, stroke: "var(--vbg-border-default)" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `${markType === "donut" ? "Donut" : "Pie"} chart of ${scopeText}${unit}s by time of day`, children: [
      slices.map(
        (s) => s.value > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.path, { d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0), fill: s.color, fillRule: "evenodd", stroke: "var(--vbg-surface-primary)", strokeWidth: 2, initial: false, animate: { d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0) } }, s.key) : null
      ),
      slices.map((s) => {
        if (s.value === 0) return null;
        const mid = (s.a0 + s.a1) / 2;
        const [lx, ly] = pt(R + 14, mid);
        const anchor = Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end";
        const dy = ly < CY - R * 0.6 ? -14 : 0;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: lx, y: ly + dy, textAnchor: anchor, fill: "currentColor", className: "vbg-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: lx, children: s.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tspan", { x: lx, dy: 14, children: [
            s.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(s.frac)
          ] })
        ] }, s.key);
      }),
      markType === "donut" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: CX, y: CY, textAnchor: "middle", fill: "currentColor", className: "vbg-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: CX, dy: -2, children: total }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tspan", { x: CX, dy: 14, children: [
          unit,
          "s"
        ] })
      ] })
    ] }),
    total > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Period" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: unit === "course" ? "Courses" : "Sections" }),
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
      total > 0 ? `${top.label} has the most ${scopeText}${unit}s: ${top.value} of ${total} (${(0, import_kit.fmtPct)(top.value / total)}). ` : "",
      count === "courses" ? "Periods go by section start time; a course with sections at several times counts in each of those periods." : "Each section counts once, by its start time.",
      unscheduled > 0 ? ` ${(0, import_kit.plural)(unscheduled, "section")} without a set meeting time ${unscheduled === 1 ? "is" : "are"} left out.` : ""
    ] })
  ] });
}
export {
  TimeOfDayChart as default
};
