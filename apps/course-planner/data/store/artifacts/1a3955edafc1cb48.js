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
var count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function Marker({ status }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true, style: { flex: "none" } };
  if (status === "done") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...common, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "6", r: "5", fill: "currentColor" }) });
  if (status === "planned")
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { ...common, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "6", r: "4.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z", fill: "currentColor" })
    ] });
  if (status === "ready") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...common, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "6", r: "4.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { ...common, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "6", cy: "6", r: "4.5", fill: "none", stroke: "var(--vbg-text-secondary)", strokeWidth: "1.5", strokeDasharray: "2 2" }) });
}
function seatInfo(code) {
  const secs = import_kit.sections.filter((s) => s.course === code);
  if (secs.length === 0) return { text: `Not offered in ${import_kit.TERM.name}`, short: "not offered", warn: false };
  const open = secs.reduce((n, s) => n + Math.max(0, s.capacity - s.enrolled), 0);
  const wait = secs.reduce((n, s) => n + s.waitlist, 0);
  if (open === 0) return { text: `${import_kit.TERM.name}: ${count(secs.length, "section")}, all full, waitlist ${wait}`, short: `full, waitlist ${wait}`, warn: true };
  return {
    text: `${import_kit.TERM.name}: ${count(secs.length, "section")}, ${count(open, "open seat")}${wait ? `, waitlist ${wait}` : ""}`,
    short: `${open} open`,
    warn: false
  };
}
function PrereqChain(props) {
  const content = props.content ?? "status";
  const expandBy = props.expandBy ?? "remaining";
  const density = props.density ?? "comfortable";
  const subject = (0, import_kit.useSubject)();
  const selection = (0, import_kit.useSelection)();
  const sid = subject.kind === "student" ? subject.id : selection.student ?? subject.advisees[0]?.id ?? "";
  const student = (0, import_kit.useStudent)(sid);
  const [overrides, setOverrides] = (0, import_react2.useState)({});
  const model = (0, import_react2.useMemo)(() => {
    if (!student) return null;
    const done = new Set(student.completed);
    const plannedCodes = new Set(
      student.planned.map((id) => import_kit.sectionById.get(id)?.course).filter((c) => typeof c === "string")
    );
    const prereqsOf = (code) => import_kit.courseByCode.get(code)?.prereqs ?? [];
    const infoOf = (code) => {
      if (done.has(code)) return { status: "done", missing: [] };
      if (plannedCodes.has(code)) return { status: "planned", missing: [] };
      const missing = (0, import_kit.missingPrereqs)(student, code);
      if (missing.length === 0) return { status: "ready", missing };
      if (missing.every((m) => plannedCodes.has(m))) return { status: "after", missing };
      return { status: "blocked", missing };
    };
    const roots = import_kit.courses.filter((c) => c.attributes.includes("capstone")).map((c) => c.code);
    const memo = /* @__PURE__ */ new Map();
    const chain = (code, stack) => {
      if (done.has(code)) return [];
      const hit = memo.get(code);
      if (hit) return hit;
      if (stack.has(code)) return [code];
      stack.add(code);
      let best = [];
      for (const p of prereqsOf(code)) {
        const c = chain(p, stack);
        if (c.length > best.length) best = c;
      }
      stack.delete(code);
      const out = [...best, code];
      memo.set(code, out);
      return out;
    };
    const chains2 = roots.map((r) => ({ root: r, chain: chain(r, /* @__PURE__ */ new Set()) }));
    const critical2 = new Set(chains2.flatMap((c) => c.chain));
    const nodes2 = [];
    const seen = /* @__PURE__ */ new Set();
    const walk = (code, depth, parentKeys, path) => {
      const key = [...path, code].join(">");
      const kids = prereqsOf(code).filter((p) => p !== code && !path.includes(p));
      const repeat = seen.has(code) && kids.length > 0;
      seen.add(code);
      nodes2.push({ key, code, depth, parentKeys, hasKids: kids.length > 0 && !repeat, repeat });
      if (repeat) return;
      for (const k of kids) walk(k, depth + 1, [...parentKeys, key], [...path, code]);
    };
    roots.forEach((r) => walk(r, 0, [], []));
    const infos2 = /* @__PURE__ */ new Map();
    for (const n of nodes2) if (!infos2.has(n.code)) infos2.set(n.code, infoOf(n.code));
    return { roots, chains: chains2, critical: critical2, nodes: nodes2, infos: infos2 };
  }, [student]);
  if (!student) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "Select a student to see how prerequisites lead to the capstone." });
  if (!model || model.roots.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "No capstone course is listed in the catalog." });
  const { chains, critical, nodes, infos } = model;
  const defaultCollapsed = (n) => {
    const st = infos.get(n.code)?.status;
    if (expandBy === "all") return false;
    if (expandBy === "remaining") return st === "done";
    return !(critical.has(n.code) && st !== "done");
  };
  const collapsedOf = (n) => overrides[`${expandBy}|${n.key}`] ?? defaultCollapsed(n);
  const collapsedKeys = new Set(nodes.filter((n) => n.hasKids && collapsedOf(n)).map((n) => n.key));
  const visible = nodes.filter((n) => !n.parentKeys.some((k) => collapsedKeys.has(k)));
  const toggle = (n) => setOverrides((o) => ({ ...o, [`${expandBy}|${n.key}`]: !collapsedOf(n) }));
  const statusText = (info, short) => {
    const miss = info.missing.join(", ");
    switch (info.status) {
      case "done":
        return short ? "completed" : "Completed";
      case "planned":
        return short ? "planned" : `Planned for ${import_kit.TERM.name}`;
      case "ready":
        return short ? "ready" : "Ready to take: prerequisites met";
      case "after":
        return short ? `after ${miss}` : `Ready after ${import_kit.TERM.name}, once ${miss} is done`;
      default:
        return short ? `needs ${miss}` : `Needs ${miss} first`;
    }
  };
  const compact = density === "compact";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vbg-custom-stack-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-custom-stack-2", children: chains.map(
      ({ root, chain }) => chain.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
        root,
        " is completed."
      ] }, root) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
        "The longest unfinished chain to ",
        root,
        " has ",
        count(chain.length, "course"),
        ": ",
        chain.join(" \u2192 "),
        ". At one link per term, ",
        root,
        " is at least",
        " ",
        count(chain.length, "term"),
        " away, counting ",
        import_kit.TERM.name,
        "."
      ] }, root)
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { role: "tree", "aria-label": "Prerequisites leading to the capstone", className: "vbg-custom-plain", style: { minWidth: compact ? 260 : 280 }, children: visible.map((n) => {
      const info = infos.get(n.code) ?? { status: "blocked", missing: [] };
      const course = import_kit.courseByCode.get(n.code);
      const collapsed = collapsedKeys.has(n.key);
      const seats = content === "seats" && info.status !== "done" ? seatInfo(n.code) : null;
      const onPath = critical.has(n.code) && info.status !== "done";
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_react.motion.li,
        {
          layout: true,
          role: "treeitem",
          "aria-level": n.depth + 1,
          "aria-expanded": n.hasKids ? !collapsed : void 0,
          style: { paddingLeft: `calc(${n.depth} * var(--vbg-space-4))` },
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                alignItems: compact ? "center" : "flex-start",
                gap: "var(--vbg-space-2)",
                paddingBlock: compact ? "var(--vbg-space-1)" : "var(--vbg-space-2)",
                paddingLeft: n.depth ? "var(--vbg-space-2)" : 0,
                borderLeft: n.depth ? "1px solid var(--vbg-border-subtle)" : void 0,
                minHeight: compact ? void 0 : 44
              },
              children: [
                n.hasKids ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    className: "vbg-custom-text-button",
                    "aria-label": `${collapsed ? "Show" : "Hide"} prerequisites of ${n.code}`,
                    onClick: () => toggle(n),
                    style: { width: "1.5em", flex: "none" },
                    children: collapsed ? "\u25B8" : "\u25BE"
                  }
                ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", style: { width: "1.5em", flex: "none" } }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { paddingTop: compact ? 0 : "0.3em", display: "flex" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Marker, { status: info.status }) }),
                compact ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "flex", gap: "var(--vbg-space-2)", alignItems: "baseline", minWidth: 0 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selection.selectCourse(n.code), title: course?.title, children: n.code }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
                    statusText(info, true),
                    n.repeat ? ", see above" : ""
                  ] }),
                  seats && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", "data-state": seats.warn ? "warning" : void 0, children: seats.short })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-custom-stack-2", style: { minWidth: 0 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selection.selectCourse(n.code), children: n.code }),
                    " ",
                    course?.title ?? ""
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
                    statusText(info, false),
                    onPath ? ". On the longest chain" : "",
                    n.repeat ? ". Its prerequisites are shown above" : ""
                  ] }),
                  seats && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", "data-state": seats.warn ? "warning" : void 0, children: seats.text })
                ] })
              ]
            }
          )
        },
        n.key
      );
    }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-caption", children: [
      "Filled circle: completed. Half circle: planned for ",
      import_kit.TERM.name,
      ". Open circle: ready to take. Dashed circle: prerequisites still missing."
    ] })
  ] });
}
export {
  PrereqChain as default
};
