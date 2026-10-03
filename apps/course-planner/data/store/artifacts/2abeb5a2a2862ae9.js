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

// malleable-host:react
var require_react = __commonJS({
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
var import_kit = __toESM(require_kit());
var import_jsx_runtime = __toESM(require_jsx_runtime());
function GradeTimeScatter(props) {
  const markType = props.markType ?? "points";
  const scope = props.scope ?? "all";
  const data = (0, import_react.useMemo)(() => {
    const points = [];
    for (const course of import_kit.courses) {
      if (scope === "cs" && course.dept !== "CS") continue;
      if (scope === "remaining" && !course.attributes?.some((a) => a !== "cs-core" && a !== "cs-elective" && a !== "math-core" && a !== "gen-ed")) continue;
      const courseSections = import_kit.sections.filter((s) => s.course === course.code);
      if (courseSections.length === 0) continue;
      if (scope === "open") {
        const hasOpen = courseSections.some((s) => s.enrolled < s.capacity);
        if (!hasOpen) continue;
      }
      const grades = course.grades;
      const total = grades.A + grades.B + grades.C + grades.D + grades.F;
      if (total === 0) continue;
      const aRate = grades.A / total;
      const earliestStart = Math.min(...courseSections.map((s) => s.meeting.start));
      const enrollment = courseSections.reduce((sum, s) => sum + s.enrolled, 0);
      points.push({
        code: course.code,
        time: earliestStart,
        aRate,
        enrollment
      });
    }
    return points.sort((a, b) => a.time - b.time);
  }, [scope]);
  const width = 600;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xScale = (0, import_kit.scaleLinear)([0, 24 * 60], [padding.left, width - padding.right]);
  const yScale = (0, import_kit.scaleLinear)([0, 1], [height - padding.bottom, padding.top]);
  const sizeScale = (0, import_kit.scaleLinear)(
    [Math.min(...data.map((d) => d.enrollment)), Math.max(...data.map((d) => d.enrollment)) || 30],
    [3, 12]
  );
  let trendPoints = [];
  if (markType === "trend" && data.length > 1) {
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.time, 0);
    const sumY = data.reduce((s, d) => s + d.aRate, 0);
    const sumXY = data.reduce((s, d) => s + d.time * d.aRate, 0);
    const sumX2 = data.reduce((s, d) => s + d.time * d.time, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const minTime = Math.min(...data.map((d) => d.time));
    const maxTime = Math.max(...data.map((d) => d.time));
    trendPoints = [
      [minTime, slope * minTime + intercept],
      [maxTime, slope * maxTime + intercept]
    ];
  }
  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hours < 12 ? "AM" : "PM";
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, "0")} ${ampm}`;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { className: "vbg-chart", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "svg",
      {
        width: "100%",
        viewBox: `0 0 ${width} ${height}`,
        style: { maxWidth: "600px" },
        role: "img",
        "aria-label": "Scatter plot of A-grade percentage by class start time",
        children: [
          [0, 0.25, 0.5, 0.75, 1].map((pct) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: padding.left,
              x2: width - padding.right,
              y1: yScale(pct),
              y2: yScale(pct),
              stroke: "var(--vbg-border-subtle)",
              strokeWidth: "1"
            },
            `h-${pct}`
          )),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: padding.left,
              x2: width - padding.right,
              y1: height - padding.bottom,
              y2: height - padding.bottom,
              stroke: "var(--vbg-border-default)",
              strokeWidth: "1"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: padding.left,
              x2: padding.left,
              y1: padding.top,
              y2: height - padding.bottom,
              stroke: "var(--vbg-border-default)",
              strokeWidth: "1"
            }
          ),
          [0, 6, 12, 18, 24].map((hour) => {
            const x = xScale(hour * 60);
            const label = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: x, x2: x, y1: height - padding.bottom, y2: height - padding.bottom + 4, stroke: "var(--vbg-border-default)", strokeWidth: "1" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x, y: height - padding.bottom + 16, textAnchor: "middle", className: "vbg-meta", style: { fill: "var(--vbg-text-secondary)" }, children: label })
            ] }, `x-tick-${hour}`);
          }),
          [0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = yScale(pct);
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: padding.left - 4, x2: padding.left, y1: y, y2: y, stroke: "var(--vbg-border-default)", strokeWidth: "1" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: padding.left - 8, y: y + 4, textAnchor: "end", className: "vbg-meta", style: { fill: "var(--vbg-text-secondary)" }, children: (0, import_kit.fmtPct)(pct) })
            ] }, `y-tick-${pct}`);
          }),
          markType === "trend" && trendPoints.length === 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "line",
            {
              x1: xScale(trendPoints[0][0]),
              y1: yScale(Math.max(0, Math.min(1, trendPoints[0][1]))),
              x2: xScale(trendPoints[1][0]),
              y2: yScale(Math.max(0, Math.min(1, trendPoints[1][1]))),
              stroke: "var(--vbg-chart-1)",
              strokeWidth: "2",
              strokeDasharray: "4,4",
              opacity: "0.6"
            }
          ),
          data.map((d) => {
            const x = xScale(d.time);
            const y = yScale(d.aRate);
            const size = markType === "bubble" ? sizeScale(d.enrollment) : 5;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "circle",
                {
                  cx: x,
                  cy: y,
                  r: size,
                  fill: "var(--vbg-chart-1)",
                  opacity: "0.7",
                  style: { cursor: "pointer" }
                }
              ),
              data.length <= 15 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "text",
                {
                  x,
                  y: y - size - 4,
                  textAnchor: "middle",
                  className: "vbg-meta",
                  style: { fill: "var(--vbg-text-secondary)" },
                  fontSize: "10",
                  children: d.code
                }
              )
            ] }, d.code);
          })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", { className: "vbg-caption", children: [
      "Each point represents one course, plotted by when it starts (x-axis) and the percentage of students who earned an A (y-axis).",
      markType === "bubble" && " Circle size represents total enrollment.",
      markType === "trend" && " The dashed line shows the trend across all courses.",
      data.length === 0 && " No courses match the current filter."
    ] })
  ] });
}
export {
  GradeTimeScatter as default
};
