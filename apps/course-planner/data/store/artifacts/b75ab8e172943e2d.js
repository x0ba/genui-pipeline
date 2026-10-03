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
var NOON = 12 * 60;
var FIVE = 17 * 60;
function deptOf(c) {
  return String(c.dept || c.code.split(" ")[0] || "").toUpperCase();
}
function isStem(c) {
  return STEM_DEPTS.has(deptOf(c));
}
function timeOk(s, t) {
  const start = s.meeting.start;
  if (t === "morning") return start < NOON;
  if (t === "after-noon") return start >= NOON;
  if (t === "evening") return start >= FIVE;
  return true;
}
function CourseFieldTimeFinder(props) {
  const subject = (0, import_kit.useSubject)();
  const { course: selected, selectCourse } = (0, import_kit.useSelection)();
  const field = props.field ?? "any";
  const startTime = props.startTime ?? "any";
  const seats = props.seats ?? "any";
  const student = subject.kind === "student" ? subject.student : null;
  const rows = (0, import_react2.useMemo)(() => {
    const out = [];
    for (const course of import_kit.courses) {
      if (student && student.completed.includes(course.code)) continue;
      if (field === "stem" && !isStem(course)) continue;
      if (field === "non-stem" && isStem(course)) continue;
      const secs = import_kit.sections.filter((s) => s.course === course.code).filter((s) => timeOk(s, startTime)).filter((s) => seats !== "open" || s.enrolled < s.capacity).sort((a, b) => a.meeting.start - b.meeting.start);
      if (!secs.length) continue;
      const open = secs.reduce((n, s) => n + Math.max(0, s.capacity - s.enrolled), 0);
      out.push({ course, secs, open });
    }
    return out.sort((a, b) => a.course.code.localeCompare(b.course.code, void 0, { numeric: true }));
  }, [student, field, startTime, seats]);
  const fieldText = field === "stem" ? "STEM " : field === "non-stem" ? "non-STEM " : "";
  const timeText = startTime === "morning" ? " with sections starting before noon" : startTime === "after-noon" ? " with sections starting at noon or later" : startTime === "evening" ? " with sections starting at 5pm or later" : "";
  const seatText = seats === "open" ? ", open seats only" : "";
  const depts = [...new Set(rows.map((r) => deptOf(r.course)))].sort();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vbg-custom-stack-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "vbg-meta", "aria-live": "polite", children: [
      (0, import_kit.plural)(rows.length, `${fieldText}course`),
      timeText,
      seatText,
      student ? ", not counting courses already completed" : "",
      depts.length ? `. Departments: ${depts.join(", ")}.` : "."
    ] }),
    rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No courses match these filters this term." }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vbg-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Course" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Title" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", children: "Matching sections" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "col", className: "vbg-numeric", children: "Open seats" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: rows.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.motion.tr, { layout: "position", "aria-selected": selected?.code === r.course.code, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { scope: "row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "vbg-custom-text-button", onClick: () => selectCourse(r.course.code), children: r.course.code }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
          r.course.title,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "vbg-meta", children: [
            isStem(r.course) ? "STEM" : "Non-STEM",
            " \xB7 ",
            (0, import_kit.plural)(Number(r.course.credits), "credit")
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: r.secs.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          (0, import_kit.fmtMeeting)(s.meeting),
          s.enrolled >= s.capacity ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { "data-state": "warning", children: [
            " full",
            s.waitlist ? `, waitlist ${s.waitlist}` : ""
          ] }) : null
        ] }, s.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "vbg-numeric", children: r.open > 0 ? r.open : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-state": "warning", children: "Full" }) })
      ] }, r.course.code)) })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "vbg-caption", children: "STEM means computer science, mathematics, statistics, the natural sciences and engineering, judged by department. Select a course code to open its details." })
  ] });
}
export {
  CourseFieldTimeFinder as default
};
