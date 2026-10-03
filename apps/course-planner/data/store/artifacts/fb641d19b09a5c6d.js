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
var STEM_DEPTS = /* @__PURE__ */ new Set([
  "CS",
  "CSE",
  "CIS",
  "COMP",
  "DATA",
  "DS",
  "INFO",
  "MATH",
  "STAT",
  "STATS",
  "PHYS",
  "CHEM",
  "BIO",
  "BIOL",
  "BIOS",
  "ENGR",
  "ENG",
  "ECE",
  "EE",
  "ME",
  "CE",
  "BME",
  "CHE",
  "ASTR",
  "GEOL",
  "GEO",
  "EES",
  "ENVS",
  "NEUR",
  "NEURO"
]);
var GROUPS = [
  { key: "stem", label: "STEM", color: "var(--vbg-chart-1)" },
  { key: "non", label: "Non-STEM", color: "var(--vbg-chart-2)" }
];
function deptOf(code) {
  const c = import_kit.courseByCode.get(code);
  if (c && c.dept) return String(c.dept);
  return code.split(" ")[0] ?? code;
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
function StemSplitChart(props) {
  const subject = (0, import_kit.useSubject)();
  const markType = props.markType ?? "pie";
  const population = props.population ?? "schedule";
  const measure = props.measure ?? "courses";
  const student = subject.kind === "student" ? subject.student : null;
  const { rows, total } = (0, import_react2.useMemo)(() => {
    const codes = /* @__PURE__ */ new Set();
    if (population === "schedule") {
      for (const c of import_kit.courses) codes.add(c.code);
    } else if (student) {
      for (const c of student.completed) codes.add(c);
      if (population === "mine") {
        for (const id of student.planned) {
          const s = import_kit.sectionById.get(id);
          if (s) codes.add(s.course);
        }
      }
    }
    const acc = {
      stem: { value: 0, depts: /* @__PURE__ */ new Map() },
      non: { value: 0, depts: /* @__PURE__ */ new Map() }
    };
    for (const code of codes) {
      const dept = deptOf(code);
      const g = STEM_DEPTS.has(dept.toUpperCase()) ? "stem" : "non";
      const v = measure === "credits" ? Number(import_kit.courseByCode.get(code)?.credits ?? 0) : 1;
      acc[g].value += v;
      acc[g].depts.set(dept, (acc[g].depts.get(dept) ?? 0) + v);
    }
    const rows2 = GROUPS.map((g) => ({
      ...g,
      value: acc[g.key].value,
      depts: [...acc[g.key].depts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    }));
    return { rows: rows2, total: rows2[0].value + rows2[1].value };
  }, [student, population, measure]);
  const unit = measure === "credits" ? "credit" : "course";
  const popText = population === "completed" ? "your completed courses" : population === "mine" ? "your completed and planned courses" : "this term's schedule";
  let angle = -Math.PI / 2;
  const slices = rows.map((r) => {
    const frac = total ? r.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...r, frac, a0, a1 };
  });
  const stem = rows[0].value;
  const non = rows[1].value;
  const ratio = non > 0 ? (stem / non).toFixed(1) : null;
  const maxVal = Math.max(1, stem, non);
  const barW = 180;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart", children: [
    total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-meta", children: [
      "No ",
      unit,
      "s to count in ",
      popText,
      "."
    ] }) : markType === "bars" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} 92`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `Bar chart of STEM and non-STEM ${unit}s in ${popText}`, children: [
      rows.map((r, i) => {
        const y = 14 + i * 38;
        const w = r.value / maxVal * barW;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: 0, y: y + 14, className: "vbg-meta", children: r.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.rect, { x: 80, y, height: 20, rx: 2, fill: r.color, initial: false, animate: { width: Math.max(w, r.value ? 2 : 0) }, transition: { type: "spring", stiffness: 200, damping: 30 } }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: 80 + w + 6, y: y + 14, className: "vbg-meta", children: [
            r.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(r.value / total)
          ] })
        ] }, r.key);
      }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: 80, x2: 80, y1: 6, y2: 86, stroke: "var(--vbg-border-default)" })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", style: { maxWidth: W }, role: "img", "aria-label": `${markType === "donut" ? "Donut" : "Pie"} chart of STEM and non-STEM ${unit}s in ${popText}`, children: [
      slices.map(
        (s) => s.value > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.path, { d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0), fill: s.color, fillRule: "evenodd", stroke: "var(--vbg-surface-primary)", strokeWidth: 2, initial: false, animate: { d: slicePath(s.a0, s.a1, markType === "donut" ? RI : 0) } }, s.key) : null
      ),
      slices.map((s) => {
        if (s.value === 0) return null;
        const mid = s.frac >= 1 - 1e-6 ? 0 : (s.a0 + s.a1) / 2;
        const [lx, ly] = pt(R + 14, mid);
        const anchor = Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end";
        const dy = ly < CY - R * 0.6 ? -14 : 0;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: lx, y: ly + dy, textAnchor: anchor, className: "vbg-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: lx, children: s.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tspan", { x: lx, dy: 14, children: [
            s.value,
            " \xB7 ",
            (0, import_kit.fmtPct)(s.frac)
          ] })
        ] }, s.key);
      }),
      markType === "donut" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", { x: CX, y: CY, textAnchor: "middle", className: "vbg-meta", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x: CX, dy: -2, children: total }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tspan", { x: CX, dy: 14, children: [
          unit,
          "s"
        ] })
      ] })
    ] }),
    total > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Group" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: measure === "credits" ? "Credits" : "Courses" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Share" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { scope: "row", children: [
          r.label,
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", children: r.depts.length ? r.depts.map(([d, n]) => `${d} ${n}`).join(", ") : "none" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: r.value }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: (0, import_kit.fmtPct)(r.value / total) })
      ] }, r.key)) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "vbg-caption", children: [
      total > 0 ? `In ${popText}, ${(0, import_kit.plural)(stem, unit)} ${stem === 1 ? "is" : "are"} STEM and ${(0, import_kit.plural)(non, unit)} ${non === 1 ? "is" : "are"} not${ratio ? `, a ratio of ${ratio} to 1` : ""}. ` : "",
      "STEM counts computer science, mathematics, statistics, the natural sciences and engineering, by department."
    ] })
  ] });
}
export {
  StemSplitChart as default
};
