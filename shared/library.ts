import type { ComponentDef } from "./spec";

// The built-in component library. Each component instantiates one Pattern Atlas
// entry and exposes a few of that entry's sub-dimensions as props. Option
// descriptions are written literally, because Jev reads them as Choice criteria.
export const BUILTIN_COMPONENTS: ComponentDef[] = [
  {
    id: "course-search",
    title: "Course search",
    description: "Searchable list of courses in the term schedule with sections, seats and times. Selecting a course opens it in course detail.",
    atlas: "search-results",
    source: "builtin",
    roles: ["student", "advisor"],
    props: {
      representation: {
        label: "Result representation",
        atlas: "search-results.representation",
        options: {
          list: "Compact one-line rows, for scanning many courses quickly",
          cards: "Larger blocks with description, rating and seats, for browsing and comparing a few courses",
          table: "Aligned columns of code, title, time, seats and rating, for precise side-by-side lookup",
        },
        default: "list",
      },
      grouping: {
        label: "Grouping",
        atlas: "search-results.grouping",
        options: {
          none: "One ungrouped list",
          department: "Grouped by department, such as CS or MATH",
          requirement: "Grouped by which degree requirement each course satisfies",
          "time-of-day": "Grouped into morning, afternoon and evening sections",
        },
        default: "none",
      },
      ranking: {
        label: "Ranking",
        atlas: "search-results.ranking",
        options: {
          code: "Ordered by course code",
          rating: "Highest instructor rating first",
          "open-seats": "Most open seats first; full sections still appear, last",
          fit: "Sections that fit the person's free time and unmet requirements first",
        },
        default: "code",
      },
      timeFilter: {
        label: "Time filter",
        atlas: "faceted-search.facetSet",
        options: {
          any: "Show sections at any time of day",
          morning: "Only sections that start before noon",
          afternoon: "Only sections that start between noon and 5pm",
          evening: "Only sections that start at 5pm or later",
          "fits-schedule": "Only sections that avoid the person's blocked times and planned classes",
        },
        default: "any",
      },
      seats: {
        label: "Seat availability",
        atlas: "faceted-search.facetSet",
        options: {
          any: "Show every section, full or not. Right whenever the request does not ask about seats or availability",
          open: "Hide full and waitlisted sections. Only when the request asks to see just courses that are still available, open or not full; a request for an order, such as most open seats first, is not this",
        },
        default: "any",
      },
      scope: {
        label: "Course scope",
        atlas: "faceted-search.facetSet",
        options: {
          all: "Every course in the schedule",
          remaining: "Only courses that satisfy the person's unmet degree requirements",
          "gen-ed": "Only general education courses",
          "cs-electives": "Only computer science electives",
        },
        default: "all",
      },
    },
  },
  {
    id: "course-detail",
    title: "Course detail",
    description: "Detail pane for the selected course: description, prerequisites, every section with seats and times, and an add-to-plan action.",
    atlas: "overview-detail",
    source: "builtin",
    roles: ["student", "advisor"],
    props: {
      emphasis: {
        label: "Detail emphasis",
        atlas: "overview-detail.attributePlacement",
        options: {
          overview: "Lead with the description and prerequisites",
          sections: "Lead with the sections table: times, instructors and seats",
          outcomes: "Lead with the grade distribution and instructor rating",
        },
        default: "overview",
      },
    },
  },
  {
    id: "week-calendar",
    title: "Weekly schedule",
    description: "The person's planned sections placed on the week, with blocked times such as work shifts and any conflicts marked.",
    atlas: "calendar",
    source: "builtin",
    roles: ["student"],
    props: {
      primaryView: {
        label: "Calendar view",
        atlas: "calendar.primaryView",
        options: {
          week: "A Monday to Friday time grid, to see gaps and overlaps spatially",
          agenda: "A day-by-day list of meetings, easier to read on a phone",
        },
        default: "week",
      },
      blocked: {
        label: "Blocked times",
        atlas: "calendar.gridFields",
        options: {
          show: "Draw work shifts and other blocked times on the schedule",
          hide: "Show only classes",
        },
        default: "show",
      },
    },
  },
  {
    id: "plan-cart",
    title: "Enrollment plan",
    description: "The sections the person plans to take this term with total credits, conflicts and waitlist warnings, and the action to submit the plan for registration.",
    atlas: "booking-flow",
    source: "builtin",
    roles: ["student"],
    props: {
      summary: {
        label: "Plan summary",
        atlas: "checkout.summary",
        options: {
          compact: "Course codes, credits and a total only",
          detailed: "Each section with time, instructor, seats, conflicts and waitlist position",
        },
        default: "detailed",
      },
      confirmation: {
        label: "Confirmation",
        atlas: "confirmation.friction",
        options: {
          direct: "Submitting happens in one click",
          review: "Submitting first shows a review of conflicts and warnings to confirm",
        },
        default: "review",
      },
    },
  },
  {
    id: "degree-progress",
    title: "Degree progress",
    description: "Progress toward the degree by requirement group: completed, planned this term and still remaining.",
    atlas: "status-tracker",
    source: "builtin",
    roles: ["student"],
    props: {
      presentation: {
        label: "Progress presentation",
        atlas: "status-tracker.presentation",
        options: {
          bars: "One progress bar per requirement group, for an at-a-glance overview",
          checklist: "Every required course listed with its status, for exact planning",
        },
        default: "bars",
      },
      detail: {
        label: "Detail level",
        atlas: "status-tracker.detail",
        options: {
          summary: "Only the counts per requirement",
          "next-steps": "Counts plus the specific courses to take next",
        },
        default: "summary",
      },
    },
  },
  {
    id: "stat-strip",
    title: "Key numbers",
    description: "A row of the few numbers that matter most for the person right now.",
    atlas: "stat-tile",
    source: "builtin",
    roles: ["student", "advisor"],
    props: {
      focus: {
        label: "Numbers shown",
        atlas: "stat-tile.context",
        options: {
          progress: "Degree progress: credits earned, requirements remaining, credits planned",
          risk: "Problems: conflicts, holds, students or courses that need attention",
          workload: "This term's load: planned credits, class hours per week, waitlisted sections",
        },
        default: "progress",
      },
    },
  },
  {
    id: "deadline-banner",
    title: "Registration notice",
    description: "A notice about the registration window, holds and deadlines that apply to the person.",
    atlas: "banner",
    source: "builtin",
    roles: ["student", "advisor"],
    props: {
      tone: {
        label: "Notice prominence",
        atlas: "banner.severity",
        options: {
          quiet: "A single quiet line of text",
          prominent: "A high-contrast band that demands attention, for imminent deadlines or blocking holds",
        },
        default: "quiet",
      },
    },
  },
  {
    id: "advisee-table",
    title: "Advisee roster",
    description: "Table of every student the advisor is responsible for, with academic, risk and enrollment signals, sortable, with bulk actions.",
    atlas: "data-table",
    source: "builtin",
    roles: ["advisor"],
    props: {
      density: {
        label: "Row density",
        atlas: "data-table.density",
        options: {
          compact: "Tight rows to fit the whole caseload on one screen",
          comfortable: "Taller rows that are easier to read and tap",
        },
        default: "comfortable",
      },
      columns: {
        label: "Column set",
        atlas: "data-table.columnSet",
        options: {
          academic: "Year, GPA and credits earned",
          risk: "Holds, credit load, graduation track and other flags",
          enrollment: "Plan status, planned credits and pending override requests",
        },
        default: "academic",
      },
      sort: {
        label: "Sort order",
        atlas: "sort-control.default",
        options: {
          name: "Alphabetical by name",
          risk: "Students with the most flags first",
          "last-contact": "Students the advisor has not contacted for the longest time first",
        },
        default: "name",
      },
      selection: {
        label: "Selection",
        atlas: "data-table.selection",
        options: {
          none: "Rows open a student; no bulk actions",
          multi: "Checkboxes on each row with bulk actions such as approve plans or send a reminder",
        },
        default: "none",
      },
    },
  },
  {
    id: "advisee-detail",
    title: "Advisee detail",
    description: "Detail pane for the selected advisee: planned sections, requirement progress, holds and contact history.",
    atlas: "overview-detail",
    source: "builtin",
    roles: ["advisor"],
    props: {
      emphasis: {
        label: "Detail emphasis",
        atlas: "overview-detail.attributePlacement",
        options: {
          plan: "Lead with the student's planned sections and conflicts",
          requirements: "Lead with requirement progress toward graduation",
          flags: "Lead with holds, risk flags and pending requests",
        },
        default: "plan",
      },
    },
  },
  {
    id: "approval-queue",
    title: "Override requests",
    description: "Queue of prerequisite, capacity and credit-overload override requests from advisees waiting for the advisor's decision.",
    atlas: "approval-flow",
    source: "builtin",
    roles: ["advisor"],
    props: {
      actions: {
        label: "Decision actions",
        atlas: "approval-flow.actions",
        options: {
          inline: "Approve and deny buttons directly on each request, for fast triage",
          review: "Each request opens the student first, for careful review before deciding",
        },
        default: "review",
      },
      grouping: {
        label: "Grouping",
        atlas: "approval-flow.routing",
        options: {
          none: "Newest requests first",
          kind: "Grouped by request type: prerequisite, capacity, credit overload",
          course: "Grouped by course",
        },
        default: "none",
      },
    },
  },
  {
    id: "demand-chart",
    title: "Course demand",
    description: "Bar chart of seats filled against capacity for each course, with waitlists and how many of the advisor's own students plan to take it.",
    atlas: "chart",
    source: "builtin",
    roles: ["advisor", "student"],
    props: {
      measure: {
        label: "Measure",
        atlas: "chart.channels",
        options: {
          "fill-rate": "Share of seats taken per course",
          waitlist: "Waitlisted students per course",
          advisees: "Number of the advisor's own students planning each course",
        },
        default: "fill-rate",
      },
      scope: {
        label: "Courses shown",
        atlas: "chart.faceting",
        options: {
          all: "Every course",
          constrained: "Only courses that are full or have a waitlist",
          cs: "Only computer science courses",
        },
        default: "all",
      },
    },
  },
];

export const BUILTIN_IDS = new Set(BUILTIN_COMPONENTS.map((c) => c.id));
