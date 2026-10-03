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
var CX = 110;
var CY = 110;
var R = 100;
var R0 = 58;
var EDGES = {
  whole: [0, 1, 2, 3, 4],
  half: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
  two: [0, 2, 4],
  "cut-2-5": [0, 2.5, 4],
  "cut-3": [0, 3, 4],
  "cut-3-5": [0, 3.5, 4]
};
function pt(a, r) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function fmtG(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function slicePath(a0, a1, donut) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(a0, R);
  const [x1, y1] = pt(a1, R);
  if (!donut) return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
  const [ix1, iy1] = pt(a1, R0);
  const [ix0, iy0] = pt(a0, R0);
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${R0} ${R0} 0 ${large} 0 ${ix0} ${iy0} Z`;
}
function fullPath(donut) {
  const outer = `M ${CX - R} ${CY} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`;
  if (!donut) return outer;
  return `${outer} M ${CX - R0} ${CY} a ${R0} ${R0} 0 1 0 ${2 * R0} 0 a ${R0} ${R0} 0 1 0 ${-2 * R0} 0 Z`;
}
function AdviseeGpaDistribution(props) {
  const subject = (0, import_kit.useSubject)();
  const { selectStudent } = (0, import_kit.useSelection)();
  const mark = props.markType ?? "pie";
  const binKey = props.bins && EDGES[props.bins] ? props.bins : "whole";
  const scope = props.scope ?? "all";
  const [picked, setPicked] = (0, import_react2.useState)(null);
  const advisees = subject.kind === "advisor" ? subject.advisees : [];
  const { bins, total, below2 } = (0, import_react2.useMemo)(() => {
    const people = advisees.filter((s) => scope !== "flagged" || (0, import_kit.risk)(s).flags.length > 0).filter((s) => typeof s.gpa === "number" && !Number.isNaN(s.gpa)).map((s) => ({ id: s.id, name: s.name, gpa: s.gpa }));
    const edges = EDGES[binKey];
    const n = edges.length - 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      const last = i === n - 1;
      const inBin = people.filter((p) => {
        const g = Math.max(0, Math.min(4, p.gpa));
        return g >= lo && (last ? g <= hi : g < hi);
      }).sort((a, b) => a.gpa - b.gpa);
      out.push({ lo, hi, label: `${fmtG(lo)}\u2013${fmtG(hi)}`, people: inBin, t: 0.2 + 0.8 * i / Math.max(1, n - 1) });
    }
    const b2 = people.filter((p) => p.gpa < 2).length;
    return { bins: out, total: people.length, below2: b2 };
  }, [advisees, scope, binKey]);
  if (subject.kind !== "advisor") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "GPA distribution is available to advisors." });
  }
  const sel = picked !== null && picked < bins.length ? bins[picked] : null;
  const maxCount = Math.max(1, ...bins.map((b) => b.people.length));
  const biggest = bins.reduce((a, b) => b.people.length > a.people.length ? b : a, bins[0]);
  const who = scope === "flagged" ? "flagged advisees" : "advisees";
  let acc = 0;
  const arcs = bins.map((b, i) => {
    const frac = total ? b.people.length / total : 0;
    const a0 = -Math.PI / 2 + acc * 2 * Math.PI;
    acc += frac;
    const a1 = -Math.PI / 2 + acc * 2 * Math.PI;
    return { i, b, frac, a0, a1 };
  });
  const toggle = (i) => setPicked((p) => p === i ? null : i);
  const legend = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vbg-custom-plain vbg-custom-stack-2", "aria-label": "GPA ranges", style: { minWidth: 200, flex: "1 1 200px" }, children: bins.map((b, i) => {
    const h = (0, import_kit.heat)(b.t);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.motion.li, { layout: true, style: { display: "flex", alignItems: "center", gap: "var(--vbg-space-2)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", style: { width: 12, height: 12, flex: "0 0 12px", background: h.fill, border: "1px solid var(--vbg-border-default)", borderRadius: "var(--vbg-radius-small)" } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "vbg-custom-text-button", "aria-pressed": picked === i, onClick: () => toggle(i), children: [
        "GPA ",
        b.label
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-numeric", style: { marginLeft: "auto" }, children: [
        b.people.length,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
          " ",
          total ? (0, import_kit.fmtPct)(b.people.length / total) : "0%"
        ] })
      ] })
    ] }, b.label);
  }) });
  let chart;
  if (mark === "bars") {
    chart = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", { className: "vbg-bar-list", tabIndex: 0, "aria-label": `Number of ${who} in each GPA range`, style: { flex: "1 1 100%" }, children: bins.map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.motion.li, { layout: true, className: "vbg-bar", "data-role": picked === i ? "primary" : void 0, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "vbg-bar-label vbg-custom-text-button", "aria-pressed": picked === i, onClick: () => toggle(i), children: [
        "GPA ",
        b.label
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-bar-value vbg-numeric", children: [
        b.people.length,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
          " ",
          total ? (0, import_kit.fmtPct)(b.people.length / total) : "0%"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-bar-track", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.span, { className: "vbg-bar-fill", initial: false, animate: { width: `${b.people.length / maxCount * 100}%` }, transition: { type: "spring", stiffness: 200, damping: 30 } }) })
    ] }, b.label)) });
  } else {
    const donut = mark === "donut";
    const nonEmpty = arcs.filter((a) => a.frac > 0);
    chart = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 220 220", width: "100%", style: { maxWidth: 240, flex: "0 1 240px" }, role: "img", "aria-label": `${donut ? "Donut" : "Pie"} chart of ${(0, import_kit.plural)(total, "advisee")} by GPA range: ${bins.map((b) => `${b.label}: ${b.people.length}`).join(", ")}`, children: [
        total === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: fullPath(donut), fill: (0, import_kit.heat)(0).fill, stroke: "var(--vbg-border-default)", fillRule: "evenodd" }) : nonEmpty.map((a) => {
          const h = (0, import_kit.heat)(a.b.t);
          const full = a.frac >= 0.9999;
          const mid = (a.a0 + a.a1) / 2;
          const lr = donut ? (R + R0) / 2 : R * 0.62;
          const [lx, ly] = full ? donut ? pt(-Math.PI / 2, lr) : [CX, CY] : pt(mid, lr);
          const showLabel = a.a1 - a.a0 > 0.45;
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { onClick: () => toggle(a.i), style: { cursor: "pointer" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "path",
              {
                d: full ? fullPath(donut) : slicePath(a.a0, a.a1, donut),
                fill: h.fill,
                fillRule: "evenodd",
                stroke: picked === a.i ? "var(--vbg-text-primary)" : "var(--vbg-surface-primary)",
                strokeWidth: picked === a.i ? 2.5 : 1.5
              }
            ),
            showLabel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: lx, y: ly + 4, textAnchor: "middle", className: "vbg-meta", style: { fill: h.ink }, children: a.b.people.length })
          ] }, a.b.label);
        }),
        donut && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: CX, y: CY - 2, textAnchor: "middle", className: "vbg-meta", style: { fill: "var(--vbg-text-primary)" }, children: total }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: CX, y: CY + 14, textAnchor: "middle", className: "vbg-meta", children: scope === "flagged" ? "flagged" : "advisees" })
        ] })
      ] }),
      legend
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart vbg-custom-stack-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--vbg-space-6)" }, children: chart }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", { className: "vbg-caption", children: total === 0 ? `No ${who} with a GPA on record.` : `${(0, import_kit.plural)(total, scope === "flagged" ? "flagged advisee" : "advisee")} by cumulative GPA. Most fall in ${biggest.label} (${biggest.people.length}); ${below2} ${below2 === 1 ? "is" : "are"} below 2.0. Select a range to list its advisees.` }),
    sel && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.motion.div, { layout: true, className: "vbg-custom-stack-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-heading-16", children: [
        "GPA ",
        sel.label,
        ": ",
        (0, import_kit.plural)(sel.people.length, "advisee")
      ] }),
      sel.people.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "Nobody in this range." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vbg-custom-plain vbg-custom-stack-2", children: sel.people.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: { display: "flex", gap: "var(--vbg-space-2)", alignItems: "baseline" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selectStudent(p.id), children: p.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta vbg-numeric", children: p.gpa.toFixed(2) })
      ] }, p.id)) })
    ] })
  ] });
}
export {
  AdviseeGpaDistribution as default
};
