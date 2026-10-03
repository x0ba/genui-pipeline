import { choice, defineComponent } from "@malleable/core";

// The built-in component library. Each component instantiates one Pattern Atlas
// entry and exposes a few of that entry's sub-dimensions as props. Option
// descriptions are written literally, because the decider reads them as choice criteria.

export const courseSearch = defineComponent({
  id: "course-search",
  title: "Course search",
  description: "Searchable list of courses in the term schedule with sections, seats and times. Selecting a course opens it in course detail.",
  catalog: "search-results",
  audiences: ["student", "advisor"],
  props: {
    representation: choice(
      {
        list: "Compact one-line rows, for scanning many courses quickly",
        cards: "Larger blocks with description, rating and seats, for browsing and comparing a few courses",
        table: "Aligned columns of code, title, time, seats and rating, for precise side-by-side lookup",
      },
      { label: "Result representation", catalog: "search-results.representation", default: "list" },
    ),
    grouping: choice(
      {
        none: "One ungrouped list",
        department: "Grouped by department, such as CS or MATH",
        requirement: "Grouped by which degree requirement each course satisfies",
        "time-of-day": "Grouped into morning, afternoon and evening sections",
      },
      { label: "Grouping", catalog: "search-results.grouping", default: "none" },
    ),
    ranking: choice(
      {
        code: "Ordered by course code",
        rating: "Highest instructor rating first",
        "open-seats": "Most open seats first; full sections still appear, last",
        fit: "Sections that fit the person's free time and unmet requirements first",
      },
      { label: "Ranking", catalog: "search-results.ranking", default: "code" },
    ),
    timeFilter: choice(
      {
        any: "Show sections at any time of day",
        morning: "Only sections that start before noon",
        afternoon: "Only sections that start between noon and 5pm",
        evening: "Only sections that start at 5pm or later",
        "fits-schedule": "Only sections that avoid the person's blocked times and planned classes",
      },
      { label: "Time filter", catalog: "faceted-search.facetSet", default: "any" },
    ),
    seats: choice(
      {
        any: "Show every section, full or not. Right whenever the request does not ask about seats or availability",
        open: "Hide full and waitlisted sections. Only when the request asks to see just courses that are still available, open or not full; a request for an order, such as most open seats first, is not this",
      },
      { label: "Seat availability", catalog: "faceted-search.facetSet", default: "any" },
    ),
    scope: choice(
      {
        all: "Every course in the schedule",
        remaining: "Only courses that satisfy the person's unmet degree requirements",
        "gen-ed": "Only general education courses",
        "cs-electives": "Only computer science electives",
      },
      { label: "Course scope", catalog: "faceted-search.facetSet", default: "all" },
    ),
  },
});

export const courseDetail = defineComponent({
  id: "course-detail",
  title: "Course detail",
  description: "Detail pane for the selected course: description, prerequisites, every section with seats and times, and an add-to-plan action.",
  catalog: "overview-detail",
  audiences: ["student", "advisor"],
  props: {
    emphasis: choice(
      {
        overview: "Lead with the description and prerequisites",
        sections: "Lead with the sections table: times, instructors and seats",
        outcomes: "Lead with the grade distribution and instructor rating",
      },
      { label: "Detail emphasis", catalog: "overview-detail.attributePlacement", default: "overview" },
    ),
  },
});

export const weekCalendar = defineComponent({
  id: "week-calendar",
  title: "Weekly schedule",
  description: "The person's planned sections placed on the week, with blocked times such as work shifts and any conflicts marked.",
  catalog: "calendar",
  audiences: ["student"],
  props: {
    primaryView: choice(
      {
        week: "A Monday to Friday time grid, to see gaps and overlaps spatially",
        agenda: "A day-by-day list of meetings, easier to read on a phone",
      },
      { label: "Calendar view", catalog: "calendar.primaryView", default: "week" },
    ),
    blocked: choice(
      {
        show: "Draw work shifts and other blocked times on the schedule",
        hide: "Show only classes",
      },
      { label: "Blocked times", catalog: "calendar.gridFields", default: "show" },
    ),
  },
});

export const planCart = defineComponent({
  id: "plan-cart",
  title: "Enrollment plan",
  description: "The sections the person plans to take this term with total credits, conflicts and waitlist warnings, and the action to submit the plan for registration.",
  catalog: "booking-flow",
  audiences: ["student"],
  props: {
    summary: choice(
      {
        compact: "Course codes, credits and a total only",
        detailed: "Each section with time, instructor, seats, conflicts and waitlist position",
      },
      { label: "Plan summary", catalog: "checkout.summary", default: "detailed" },
    ),
    confirmation: choice(
      {
        direct: "Submitting happens in one click",
        review: "Submitting first shows a review of conflicts and warnings to confirm",
      },
      { label: "Confirmation", catalog: "confirmation.friction", default: "review" },
    ),
  },
});

export const degreeProgress = defineComponent({
  id: "degree-progress",
  title: "Degree progress",
  description: "Progress toward the degree by requirement group: completed, planned this term and still remaining.",
  catalog: "status-tracker",
  audiences: ["student"],
  props: {
    presentation: choice(
      {
        bars: "One progress bar per requirement group, for an at-a-glance overview",
        checklist: "Every required course listed with its status, for exact planning",
      },
      { label: "Progress presentation", catalog: "status-tracker.presentation", default: "bars" },
    ),
    detail: choice(
      {
        summary: "Only the counts per requirement",
        "next-steps": "Counts plus the specific courses to take next",
      },
      { label: "Detail level", catalog: "status-tracker.detail", default: "summary" },
    ),
  },
});

export const statStrip = defineComponent({
  id: "stat-strip",
  title: "Key numbers",
  description: "A row of the few numbers that matter most for the person right now.",
  catalog: "stat-tile",
  audiences: ["student", "advisor"],
  props: {
    focus: choice(
      {
        progress: "Degree progress: credits earned, requirements remaining, credits planned",
        risk: "Problems: conflicts, holds, students or courses that need attention",
        workload: "This term's load: planned credits, class hours per week, waitlisted sections",
      },
      { label: "Numbers shown", catalog: "stat-tile.context", default: "progress" },
    ),
  },
});

export const deadlineBanner = defineComponent({
  id: "deadline-banner",
  title: "Registration notice",
  description: "A notice about the registration window, holds and deadlines that apply to the person.",
  catalog: "banner",
  audiences: ["student", "advisor"],
  props: {
    tone: choice(
      {
        quiet: "A single quiet line of text",
        prominent: "A high-contrast band that demands attention, for imminent deadlines or blocking holds",
      },
      { label: "Notice prominence", catalog: "banner.severity", default: "quiet" },
    ),
  },
});

export const adviseeTable = defineComponent({
  id: "advisee-table",
  title: "Advisee roster",
  description: "Table of every student the advisor is responsible for, with academic, risk and enrollment signals, sortable, with bulk actions.",
  catalog: "data-table",
  audiences: ["advisor"],
  props: {
    density: choice(
      {
        compact: "Tight rows to fit the whole caseload on one screen",
        comfortable: "Taller rows that are easier to read and tap",
      },
      { label: "Row density", catalog: "data-table.density", default: "comfortable" },
    ),
    columns: choice(
      {
        academic: "Year, GPA and credits earned",
        risk: "Holds, credit load, graduation track and other flags",
        enrollment: "Plan status, planned credits and pending override requests",
      },
      { label: "Column set", catalog: "data-table.columnSet", default: "academic" },
    ),
    sort: choice(
      {
        name: "Alphabetical by name",
        risk: "Students with the most flags first",
        "last-contact": "Students the advisor has not contacted for the longest time first",
      },
      { label: "Sort order", catalog: "sort-control.default", default: "name" },
    ),
    selection: choice(
      {
        none: "Rows open a student; no bulk actions",
        multi: "Checkboxes on each row with bulk actions such as approve plans or send a reminder",
      },
      { label: "Selection", catalog: "data-table.selection", default: "none" },
    ),
  },
});

export const adviseeDetail = defineComponent({
  id: "advisee-detail",
  title: "Advisee detail",
  description: "Detail pane for the selected advisee: planned sections, requirement progress, holds and contact history.",
  catalog: "overview-detail",
  audiences: ["advisor"],
  props: {
    emphasis: choice(
      {
        plan: "Lead with the student's planned sections and conflicts",
        requirements: "Lead with requirement progress toward graduation",
        flags: "Lead with holds, risk flags and pending requests",
      },
      { label: "Detail emphasis", catalog: "overview-detail.attributePlacement", default: "plan" },
    ),
  },
});

export const approvalQueue = defineComponent({
  id: "approval-queue",
  title: "Override requests",
  description: "Queue of prerequisite, capacity and credit-overload override requests from advisees waiting for the advisor's decision.",
  catalog: "approval-flow",
  audiences: ["advisor"],
  props: {
    actions: choice(
      {
        inline: "Approve and deny buttons directly on each request, for fast triage",
        review: "Each request opens the student first, for careful review before deciding",
      },
      { label: "Decision actions", catalog: "approval-flow.actions", default: "review" },
    ),
    grouping: choice(
      {
        none: "Newest requests first",
        kind: "Grouped by request type: prerequisite, capacity, credit overload",
        course: "Grouped by course",
      },
      { label: "Grouping", catalog: "approval-flow.routing", default: "none" },
    ),
  },
});

export const demandChart = defineComponent({
  id: "demand-chart",
  title: "Course demand",
  description: "Bar chart of seats filled against capacity for each course, with waitlists and how many of the advisor's own students plan to take it.",
  catalog: "chart",
  audiences: ["advisor", "student"],
  props: {
    measure: choice(
      {
        "fill-rate": "Share of seats taken per course",
        waitlist: "Waitlisted students per course",
        advisees: "Number of the advisor's own students planning each course",
      },
      { label: "Measure", catalog: "chart.channels", default: "fill-rate" },
    ),
    scope: choice(
      {
        all: "Every course",
        constrained: "Only courses that are full or have a waitlist",
        cs: "Only computer science courses",
      },
      { label: "Courses shown", catalog: "chart.faceting", default: "all" },
    ),
  },
});

export const LIBRARY = [
  courseSearch,
  courseDetail,
  weekCalendar,
  planCart,
  degreeProgress,
  statStrip,
  deadlineBanner,
  adviseeTable,
  adviseeDetail,
  approvalQueue,
  demandChart,
];
