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
var daysSince = (date) => Math.round((Date.parse(import_kit.TERM.today) - Date.parse(date)) / 864e5);
var STATUS = { "not-started": "Not started", draft: "Draft", submitted: "Submitted", approved: "Approved" };
function AdviseeFullRoster(props) {
  const subject = (0, import_kit.useSubject)();
  const { student: selected, selectStudent, rows: checked, setRows } = (0, import_kit.useSelection)();
  const { requests } = (0, import_kit.useOverrides)();
  const notify = (0, import_kit.useNotify)();
  const density = props.density ?? "compact";
  const sort = props.sort ?? "name";
  const filter = props.rows ?? "all";
  const compact = density === "compact";
  const rows = (0, import_react2.useMemo)(() => {
    if (subject.kind !== "advisor") return [];
    const list = subject.advisees.map((s) => {
      const r = (0, import_kit.risk)(s);
      return {
        s,
        r,
        earned: (0, import_kit.creditsOf)(s.completed),
        conflicts: (0, import_kit.scheduleConflicts)(s).length,
        pending: requests.filter((o) => o.student === s.id && o.status === "pending").length,
        days: daysSince(s.lastContact)
      };
    });
    const filters = {
      all: () => true,
      flagged: (x) => x.r.flags.length > 0,
      "under-12": (x) => x.r.credits < 12,
      holds: (x) => x.s.holds.length > 0
    };
    const byName = (a, b) => a.s.name.localeCompare(b.s.name);
    const sorters = {
      name: byName,
      risk: (a, b) => b.r.score - a.r.score || b.r.flags.length - a.r.flags.length || byName(a, b),
      gpa: (a, b) => a.s.gpa - b.s.gpa || byName(a, b),
      "last-contact": (a, b) => b.days - a.days || byName(a, b)
    };
    return list.filter(filters[filter] ?? filters.all).sort(sorters[sort] ?? byName);
  }, [subject, requests, sort, filter]);
  if (subject.kind !== "advisor") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-meta", children: "The roster is for advisors." });
  const total = subject.advisees.length;
  const allChecked = rows.length > 0 && rows.every((x) => checked.includes(x.s.id));
  const toggle = (id) => setRows(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  const remind = () => {
    notify(`Reminder sent to ${checked.length} ${checked.length === 1 ? "advisee" : "advisees"}`);
    setRows([]);
  };
  const avg = (f) => rows.length ? rows.reduce((n, x) => n + f(x), 0) / rows.length : 0;
  const flaggedCount = rows.filter((x) => x.r.flags.length).length;
  const pendingTotal = rows.reduce((n, x) => n + x.pending, 0);
  const cell = compact ? { whiteSpace: "nowrap" } : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vbg-custom-stack-2", "data-density": density, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vbg-custom-bulk", role: "toolbar", "aria-label": "Bulk actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
        rows.length === total ? `${total} advisees` : `${rows.length} of ${total} advisees`,
        checked.length ? ` \xB7 ${checked.length} selected` : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", disabled: !checked.length, onClick: remind, children: "Send reminder" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap vbg-custom-roster", style: { overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("caption", { className: "vbg-visually-hidden", children: "All advisees and their information" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            "aria-label": "Select all shown",
            checked: allChecked,
            onChange: () => setRows(allChecked ? [] : rows.map((x) => x.s.id))
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Name" }),
        compact && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Program" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Year" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "GPA" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Earned cr" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Planned cr" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Plan" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Courses left" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Terms left" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Holds" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Conflicts" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Flags" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Overrides" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Days since contact" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
        rows.map(({ s, r, earned, conflicts, pending, days }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          import_react.motion.tr,
          {
            layout: "position",
            transition: { type: "spring", stiffness: 500, damping: 45 },
            "aria-selected": selected === s.id,
            className: "vbg-custom-clickable",
            onClick: () => selectStudent(s.id),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", "aria-label": `Select ${s.name}`, checked: checked.includes(s.id), onChange: () => toggle(s.id) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", style: cell, children: compact ? s.name : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vbg-custom-stack-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: s.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", children: s.program })
              ] }) }),
              compact && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: cell, children: s.program }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: s.year }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", "data-state": s.gpa < 2.3 ? "error" : void 0, children: s.gpa.toFixed(2) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: earned }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", "data-state": r.credits < 12 ? "warning" : void 0, children: r.credits }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: cell, children: STATUS[s.planStatus] ?? s.planStatus }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: r.remainingCourses }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: r.termsLeft }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", "data-state": s.holds.length ? "error" : void 0, title: s.holds.map((h) => `${h.kind}: ${h.note}`).join("; "), children: s.holds.length || "\u2013" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", "data-state": conflicts ? "warning" : void 0, children: conflicts || "\u2013" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: cell, "data-state": r.flags.length ? "error" : void 0, children: r.flags.length ? r.flags.join(compact ? "; " : ", ") : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "vbg-meta", children: "None" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: pending || "\u2013" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: days })
            ]
          },
          s.id
        )),
        rows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { colSpan: compact ? 15 : 14, className: "vbg-meta", children: "No advisees match." }) })
      ] }),
      rows.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tfoot", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", children: plural(rows.length) }),
        compact && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: avg((x) => x.s.gpa).toFixed(2) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: Math.round(avg((x) => x.earned)) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: avg((x) => x.r.credits).toFixed(1) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: avg((x) => x.r.remainingCourses).toFixed(1) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {}),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: rows.filter((x) => x.s.holds.length).length }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: rows.filter((x) => x.conflicts).length }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "vbg-meta", children: [
          flaggedCount,
          " flagged"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: pendingTotal }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {})
      ] }) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-caption", children: "Footer shows averages for GPA, credits and courses left, and counts for holds, conflicts, flags and overrides." })
  ] });
}
function plural(n) {
  return `${n} ${n === 1 ? "advisee" : "advisees"}`;
}
export {
  AdviseeFullRoster as default
};
