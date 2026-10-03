// Labelled requests the decider should and should not flag as outside the spec,
// and for served requests, the view and props it should pick. Calls the decider
// only, never the builder.
import { formatResult, runEval, type EvalCase } from "@malleable/eval";
import { malleable } from "../server/malleable";

const context = { device: "desktop", registration_phase: "planning" };
const c = (user: string, request: string, gap: boolean, expect: Omit<EvalCase["expect"], "gap"> = {}, spec?: "default"): EvalCase => ({
  user,
  request,
  context,
  ...(spec ? { spec } : {}),
  expect: { gap, ...expect },
});

const cases: EvalCase[] = [
  c("maya", "Give me a list of the courses that have to do with science, technology, engineering, or math that are still open and don't have a waitlist", true),
  c("maya", "Only show courses that still have open seats", false, { view: "catalog", props: { results: { seats: "open" } } }),
  c("maya", "Give me a list of courses that are still available", false, { view: "catalog", props: { results: { seats: "open" } } }),
  c("maya", "Give me a list of courses that are after noon", false, { view: "catalog", props: { results: { timeFilter: "afternoon", seats: "any" } } }),
  c("maya", "What fits around my library shifts?", false),
  c("maya", "Show my week", false),
  c("maya", "What do I still need to graduate?", false),
  c("maya", "Show how prerequisites chain from what I've taken to the capstone", false),
  c("maya", "Which remaining requirement courses fit my week?", false),
  c("maya", "Show a histogram of grade distributions for every CS course I could take", true),
  c("sam", "Find an afternoon gen-ed", false, { view: "catalog", props: { results: { timeFilter: "afternoon", scope: "gen-ed", seats: "any" } } }),
  c("sam", "Show courses with the most open seats first", false, { view: "catalog", props: { results: { ranking: "open-seats", seats: "any" } } }),
  c("sam", "Only CS electives in the evening", false, { view: "catalog", props: { results: { timeFilter: "evening", scope: "cs-electives", seats: "any" } } }),
  c("sam", "Evening courses that still have seats", false, { view: "catalog", props: { results: { timeFilter: "evening", seats: "open" } } }),
  c("sam", "Which courses are full?", false),
  // Served from the shared default, which has no roster or override queue.
  c("okafor", "Who needs my attention before registration opens?", true, {}, "default"),
  c("okafor", "Clear the pending override requests", true, {}, "default"),
  c("okafor", "Which courses will my advisees get waitlisted in?", false, {}, "default"),
  c("okafor", "Show a heatmap of when my advisees' planned classes meet across the week", true, {}, "default"),
  // Okafor's own spec has a GPA chart whose ranges are one-point or half-point:
  // requests for other ranges must be flagged, not rounded to the nearest option.
  c("okafor", "give me a pie chart of the amount of people with gpa's from 0-1, 1-2, 2-3, and 3-4", false, { props: { "gpa-chart": { bins: "whole", markType: "pie" } } }),
  c("okafor", "give me a pie chart of the amount of people with gpa's from 0-2 and 2-4", true),
  c("okafor", "Pie chart of advisees above and below a 3.3 GPA", true),
  c("okafor", "Bar chart of advisee GPAs in half-point ranges", false, { props: { "gpa-chart": { bins: "half", markType: "bars" } } }),
  c("okafor", "Pie chart of my advisees' GPAs", false, { props: { "gpa-chart": { bins: "whole" } } }),
];

const report = await runEval(malleable, cases, {
  concurrency: 4,
  onResult: (r) => console.log(formatResult(r, ["results", "gpa-chart"])),
});
console.log(`\n${report.correct}/${report.total} correct, $${report.costUsd.toFixed(4)}`);
