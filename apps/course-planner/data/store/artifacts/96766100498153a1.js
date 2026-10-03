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
function dayName(d, i) {
  const names = import_kit.DAY_NAMES;
  const n = Array.isArray(names) ? names[i] : names?.[d];
  return typeof n === "string" ? n : d;
}
function WeeklyTimeHeatmap(props) {
  const subject = (0, import_kit.useSubject)();
  const { selectCourse } = (0, import_kit.useSelection)();
  const bins = props.bins ?? "hour";
  const count = props.count ?? "courses";
  const scope = props.scope ?? "all";
  const [picked, setPicked] = (0, import_react2.useState)(null);
  const remaining = (0, import_react2.useMemo)(() => {
    if (subject.kind !== "student") return /* @__PURE__ */ new Set();
    return new Set((0, import_kit.requirementStatus)(subject.student).flatMap((r) => r.remaining));
  }, [subject]);
  const pool = (0, import_react2.useMemo)(
    () => import_kit.sections.filter((s) => {
      const c = import_kit.courseByCode.get(s.course);
      if (scope === "cs") return c?.dept === "CS";
      if (scope === "remaining") return remaining.has(s.course);
      if (scope === "open") return s.enrolled < s.capacity;
      return true;
    }),
    [scope, remaining]
  );
  const rows = (0, import_react2.useMemo)(() => {
    if (bins === "period") {
      return [
        { start: 0, end: 720, label: "Morning", long: "Morning, before noon" },
        { start: 720, end: 1020, label: "Afternoon", long: "Afternoon, noon to 5 PM" },
        { start: 1020, end: 1440, label: "Evening", long: "Evening, 5 PM or later" }
      ];
    }
    const step = bins === "half-hour" ? 30 : bins === "two-hour" ? 120 : 60;
    const minStart = Math.min(...import_kit.sections.map((s) => s.meeting.start));
    const maxEnd = Math.max(...import_kit.sections.map((s) => s.meeting.end));
    const first = Math.floor(minStart / step) * step;
    const out = [];
    for (let t = first; t < maxEnd; t += step) {
      out.push({ start: t, end: t + step, label: (0, import_kit.fmtTime)(t), long: `${(0, import_kit.fmtTime)(t)} to ${(0, import_kit.fmtTime)(t + step)}` });
    }
    return out;
  }, [bins]);
  const grid = (0, import_react2.useMemo)(
    () => rows.map(
      (b) => import_kit.DAYS.map((d) => {
        const hits = pool.filter((s) => s.meeting.days.includes(d) && s.meeting.start < b.end && s.meeting.end > b.start);
        const codes = Array.from(new Set(hits.map((s) => s.course))).sort();
        return { n: count === "sections" ? hits.length : codes.length, codes, hits };
      })
    ),
    [rows, pool, count]
  );
  const max = Math.max(1, ...grid.flat().map((c) => c.n));
  let best = { n: -1, r: 0, d: 0 };
  grid.forEach((row, r) => row.forEach((c, d) => {
    if (c.n > best.n) best = { n: c.n, r, d };
  }));
  const unit = count === "sections" ? "section" : "course";
  const sel = picked && grid[picked.bin]?.[picked.day] ? { ...picked, cell: grid[picked.bin][picked.day] } : null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart vbg-custom-stack-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap", style: { overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { "aria-label": `Number of ${unit}s meeting in each day and time frame`, style: { borderCollapse: "separate", borderSpacing: 2, width: "100%" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-meta", style: { textAlign: "left" }, children: "Time" }),
        import_kit.DAYS.map((d, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", style: { textAlign: "center" }, title: dayName(d, i), children: dayName(d, i).slice(0, 3) }, d))
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((b, r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", className: "vbg-meta", style: { textAlign: "left", whiteSpace: "nowrap" }, title: b.long, children: b.label }),
        import_kit.DAYS.map((d, i) => {
          const c = grid[r][i];
          const h = (0, import_kit.heat)(c.n / max);
          const on = picked?.bin === r && picked?.day === i;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", style: { background: h.fill, color: h.ink, padding: 0, textAlign: "center", borderRadius: "var(--vbg-radius-small)", outline: on ? "2px solid var(--vbg-border-strong)" : void 0, outlineOffset: -2 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              "aria-pressed": on,
              "aria-label": `${dayName(d, i)}, ${b.long}: ${(0, import_kit.plural)(c.n, unit)}`,
              onClick: () => setPicked(on ? null : { day: i, bin: r }),
              style: { all: "unset", boxSizing: "border-box", display: "block", width: "100%", minWidth: 36, padding: "var(--vbg-space-2) var(--vbg-space-1)", textAlign: "center", cursor: "pointer", color: h.ink, background: h.fill },
              children: c.n
            }
          ) }, d);
        })
      ] }, b.start)) })
    ] }) }),
    sel && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.motion.div, { layout: true, className: "vbg-custom-stack-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-heading-16", children: [
        dayName(import_kit.DAYS[sel.day], sel.day),
        ", ",
        rows[sel.bin].long,
        ": ",
        (0, import_kit.plural)(sel.cell.n, unit)
      ] }),
      sel.cell.codes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "Nothing meets then." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vbg-custom-plain", style: { display: "flex", flexWrap: "wrap", gap: "var(--vbg-space-2)" }, children: sel.cell.codes.map((code) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selectCourse(code), children: code }) }, code)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", { className: "vbg-caption", children: best.n > 0 ? `Darker cells have more ${unit}s in session. Busiest: ${dayName(import_kit.DAYS[best.d], best.d)}, ${rows[best.r].long}, with ${(0, import_kit.plural)(best.n, unit)}. A class counts in every time frame it overlaps. Select a cell to list its courses.` : "No sections match this filter." })
  ] });
}
export {
  WeeklyTimeHeatmap as default
};
