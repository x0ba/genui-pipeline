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
var DAY_LABEL = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
var DAY_LONG = { M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday" };
function AdviseeMeetingHeatmap(props) {
  const subject = (0, import_kit.useSubject)();
  const { selectStudent } = (0, import_kit.useSelection)();
  const scope = props.scope ?? "all";
  const bin = props.binSize === "half-hour" ? 30 : 60;
  const annotation = props.annotation ?? "counts";
  const people = subject.kind === "advisor" ? subject.advisees : [subject.student];
  const [picked, setPicked] = (0, import_react2.useState)(null);
  const model = (0, import_react2.useMemo)(() => {
    const pool = scope === "flagged" ? people.filter((p) => (0, import_kit.risk)(p).flags.length > 0) : people;
    const entries = [];
    const withClasses = /* @__PURE__ */ new Set();
    for (const p of pool) {
      for (const id of p.planned) {
        const sec = import_kit.sectionById.get(id);
        if (!sec || !sec.meeting || sec.meeting.days.length === 0) continue;
        if (scope === "cs" && import_kit.courseByCode.get(sec.course)?.dept !== "CS") continue;
        entries.push({ studentId: p.id, name: p.name, course: sec.course, meeting: sec.meeting });
        withClasses.add(p.id);
      }
    }
    let lo = 8 * 60;
    let hi = 17 * 60;
    if (entries.length) {
      lo = Math.min(lo, ...entries.map((e) => Math.floor(e.meeting.start / 60) * 60));
      hi = Math.max(hi, ...entries.map((e) => Math.ceil(e.meeting.end / 60) * 60));
    }
    const rows = [];
    for (let t = lo; t < hi; t += bin) rows.push(t);
    const cells = [];
    import_kit.DAYS.forEach((day, di) => {
      rows.forEach((start, ri) => {
        const hits = [];
        const seen = /* @__PURE__ */ new Set();
        for (const e of entries) {
          if (!e.meeting.days.includes(day)) continue;
          if (e.meeting.start < start + bin && e.meeting.end > start) {
            hits.push({ studentId: e.studentId, name: e.name, course: e.course, meeting: (0, import_kit.fmtMeeting)(e.meeting) });
            seen.add(e.studentId);
          }
        }
        hits.sort((a, b) => a.name.localeCompare(b.name));
        cells.push({ day, di, ri, start, count: seen.size, hits });
      });
    });
    const max = Math.max(1, ...cells.map((c) => c.count));
    const ranked = [...cells].filter((c) => c.count > 0).sort((a, b) => b.count - a.count || a.di - b.di || a.ri - b.ri);
    const peaks = new Set(ranked.slice(0, 3).map((c) => `${c.day}-${c.start}`));
    const core = cells.filter((c) => c.start >= 9 * 60 && c.start + bin <= 17 * 60);
    const quiet = [...core].sort((a, b) => a.count - b.count || a.di - b.di || a.ri - b.ri)[0];
    return { pool: pool.length, withClasses: withClasses.size, rows, cells, max, peaks, top: ranked[0], quiet };
  }, [people, scope, bin]);
  const labelW = 56;
  const colW = 100;
  const headerH = 26;
  const rowH = bin === 60 ? 28 : 18;
  const width = labelW + import_kit.DAYS.length * colW;
  const height = headerH + model.rows.length * rowH + 4;
  const range = (c) => `${(0, import_kit.fmtTime)(c.start)}\u2013${(0, import_kit.fmtTime)(c.start + bin)}`;
  const selected = model.cells.find((c) => `${c.day}-${c.start}` === picked) ?? null;
  const who = scope === "flagged" ? "flagged advisees" : "advisees";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart vbg-custom-stack-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        width: "100%",
        style: { maxWidth: width, display: "block" },
        role: "group",
        "aria-label": `Number of ${who} in class by weekday and ${bin === 60 ? "hour" : "half hour"}`,
        children: [
          import_kit.DAYS.map((d, di) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: labelW + di * colW + colW / 2, y: 17, textAnchor: "middle", className: "vbg-meta", style: { fill: "var(--vbg-text-primary)" }, children: DAY_LABEL[d] ?? d }, d)),
          model.rows.map(
            (t, ri) => t % 60 === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: labelW - 8, y: headerH + ri * rowH + 12, textAnchor: "end", className: "vbg-meta", children: (0, import_kit.fmtTime)(t) }, t) : null
          ),
          model.cells.map((c) => {
            const key = `${c.day}-${c.start}`;
            const x = labelW + c.di * colW + 1;
            const y = headerH + c.ri * rowH + 1;
            const w = colW - 2;
            const cellH = rowH - 2;
            const h = (0, import_kit.heat)(c.count / model.max);
            const isPeak = model.peaks.has(key);
            const isSel = picked === key;
            const showLabel = c.count > 0 && (annotation === "counts" || isPeak);
            const outline = isSel || annotation === "peaks" && isPeak;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "g",
              {
                role: "button",
                tabIndex: 0,
                "aria-pressed": isSel,
                "aria-label": `${DAY_LONG[c.day] ?? c.day} ${range(c)}: ${(0, import_kit.plural)(c.count, "advisee")} in class`,
                onClick: () => setPicked(isSel ? null : key),
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPicked(isSel ? null : key);
                  }
                },
                style: { cursor: "pointer" },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x, y, width: w, height: cellH, rx: 2, fill: h.fill }),
                  outline && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: x + 1, y: y + 1, width: w - 2, height: cellH - 2, rx: 2, fill: "none", stroke: h.ink, strokeWidth: 2 }),
                  showLabel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: x + w / 2, y: y + cellH / 2 + 4, textAnchor: "middle", className: "vbg-meta", style: { fill: h.ink }, children: annotation === "peaks" && bin === 60 ? `${c.count} in class` : c.count })
                ]
              },
              key
            );
          })
        ]
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "vbg-visually-hidden", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("caption", { children: `${who} in class by time and weekday` }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Time" }),
        import_kit.DAYS.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: DAY_LONG[d] ?? d }, d))
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: model.rows.map((t, ri) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", children: `${(0, import_kit.fmtTime)(t)}\u2013${(0, import_kit.fmtTime)(t + bin)}` }),
        import_kit.DAYS.map((d, di) => {
          const c = model.cells.find((x) => x.di === di && x.ri === ri);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: c ? c.count : 0 }, d);
        })
      ] }, t)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", { className: "vbg-caption", children: model.withClasses === 0 ? `None of the ${(0, import_kit.plural)(model.pool, "advisee")} in this view have planned classes with meeting times yet.` : `${model.withClasses} of ${(0, import_kit.plural)(model.pool, scope === "flagged" ? "flagged advisee" : "advisee")} have planned classes${scope === "cs" ? " in computer science" : ""}. ` + (model.top ? `Busiest: ${DAY_LONG[model.top.day]} ${range(model.top)}, with ${model.top.count} in class. ` : "") + (model.quiet ? `Quietest weekday slot between 9:00 and 17:00: ${DAY_LONG[model.quiet.day]} ${range(model.quiet)}, with ${model.quiet.count} in class.` : "") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.motion.div, { layout: true, className: "vbg-custom-stack-2", "aria-live": "polite", children: selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-heading-16", children: `${DAY_LONG[selected.day]} ${range(selected)}: ${(0, import_kit.plural)(selected.count, "advisee")} in class` }),
      selected.hits.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "Nobody in this view has a class then." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "vbg-custom-plain vbg-custom-stack-2", children: selected.hits.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selectStudent(h.studentId), children: h.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", children: ` ${h.course}, ${h.meeting}` })
      ] }, `${h.studentId}-${h.course}-${i}`)) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "Select a cell to list the advisees in class at that time." }) })
  ] });
}
export {
  AdviseeMeetingHeatmap as default
};
