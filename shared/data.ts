// A small, deterministic university: one CS program, a Spring 2027 schedule,
// one advisor's caseload. Every persona and every component reads from here.

export type Day = "M" | "T" | "W" | "R" | "F";
export const DAYS: Day[] = ["M", "T", "W", "R", "F"];
export const DAY_NAMES: Record<Day, string> = { M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday" };

export type Meeting = { days: Day[]; start: number; end: number }; // minutes after midnight
export type Attribute = "cs-core" | "cs-elective" | "math-core" | "capstone" | "gen-ed";

export type Course = {
  code: string;
  title: string;
  dept: string;
  level: number;
  credits: number;
  description: string;
  prereqs: string[];
  attributes: Attribute[];
  rating: number; // mean instructor rating, 1–5
  grades: { A: number; B: number; C: number; D: number; F: number }; // share of students, last 3 terms
};

export type Section = {
  id: string;
  course: string;
  number: string;
  instructor: string;
  meeting: Meeting;
  room: string;
  modality: "in-person" | "online" | "hybrid";
  capacity: number;
  enrolled: number;
  waitlist: number;
};

export type Requirement = { id: string; title: string; courses: string[]; choose?: number };
export type Program = { id: string; title: string; totalCredits: number; requirements: Requirement[] };

export type Hold = { kind: "financial" | "advising" | "immunization" | "conduct"; note: string };
export type OverrideRequest = {
  id: string;
  student: string;
  course: string;
  kind: "prerequisite" | "capacity" | "credit-overload";
  reason: string;
  submitted: string;
  status: "pending" | "approved" | "denied";
};

export type Student = {
  id: string;
  name: string;
  year: 1 | 2 | 3 | 4;
  program: string;
  gpa: number;
  completed: string[];
  planned: string[]; // section ids
  planStatus: "not-started" | "draft" | "submitted" | "approved";
  holds: Hold[];
  blocked: (Meeting & { label: string })[];
  advisor: string;
  lastContact: string;
};

export type Advisor = { id: string; name: string; dept: string; advisees: string[] };

export const TERM = { name: "Spring 2027", registrationOpens: "2026-11-02", addDropEnds: "2027-01-29", today: "2026-10-28" };

const t = (h: number, m = 0) => h * 60 + m;

// ---------------------------------------------------------------- courses
const C = (
  code: string,
  title: string,
  credits: number,
  prereqs: string[],
  attributes: Attribute[],
  rating: number,
  gradeA: number,
  description: string,
): Course => {
  const [dept, num] = code.split(" ");
  const a = gradeA;
  const b = Math.min(0.45, 0.72 - a);
  const c = Math.max(0.06, 0.9 - a - b);
  const d = 0.05;
  return {
    code,
    title,
    dept,
    level: Math.floor(Number(num) / 100) * 100,
    credits,
    description,
    prereqs,
    attributes,
    rating,
    grades: { A: a, B: b, C: c, D: d, F: Math.max(0.01, 1 - a - b - c - d) },
  };
};

export const courses: Course[] = [
  C("CS 101", "Introduction to Programming", 4, [], ["cs-core"], 4.4, 0.38, "Problem solving with Python: control flow, functions, data, testing and debugging."),
  C("CS 150", "Data Structures", 4, ["CS 101"], ["cs-core"], 4.1, 0.31, "Lists, trees, hash tables and graphs, with the analysis to choose between them."),
  C("CS 210", "Computer Systems", 4, ["CS 150"], ["cs-core"], 3.7, 0.24, "How programs run: C, memory, assembly, caches, processes and linking."),
  C("CS 220", "Algorithms", 4, ["CS 150", "MATH 210"], ["cs-core"], 3.9, 0.22, "Design and analysis of algorithms: divide and conquer, greedy, dynamic programming, graphs."),
  C("CS 230", "Software Engineering", 4, ["CS 150"], ["cs-core"], 4.2, 0.41, "Team projects, version control, testing, code review and shipping software people use."),
  C("CS 310", "Operating Systems", 4, ["CS 210"], ["cs-core"], 3.6, 0.2, "Processes, threads, scheduling, virtual memory and file systems, built in C."),
  C("CS 320", "Theory of Computation", 4, ["CS 220"], ["cs-core"], 3.5, 0.19, "Automata, grammars, computability and complexity."),
  C("CS 330", "Databases", 4, ["CS 150"], ["cs-elective"], 4.0, 0.33, "Relational modelling, SQL, transactions, indexing and query planning."),
  C("CS 340", "Computer Networks", 4, ["CS 210"], ["cs-elective"], 3.8, 0.27, "The internet stack from links to applications, with hands-on packet analysis."),
  C("CS 350", "Programming Languages", 4, ["CS 220"], ["cs-elective"], 4.3, 0.29, "Semantics, type systems and interpreters across functional and object paradigms."),
  C("CS 360", "Machine Learning", 4, ["CS 220", "STAT 250", "MATH 220"], ["cs-elective"], 4.0, 0.26, "Supervised and unsupervised learning, evaluation and the maths behind them."),
  C("CS 370", "Human-Computer Interaction", 4, ["CS 230"], ["cs-elective"], 4.6, 0.44, "Designing, prototyping and evaluating interfaces with real people."),
  C("CS 380", "Computer Graphics", 4, ["CS 220", "MATH 220"], ["cs-elective"], 3.9, 0.28, "Rasterization, shading, transformations and the GPU pipeline."),
  C("CS 390", "Computer Security", 4, ["CS 210"], ["cs-elective"], 4.1, 0.25, "Threat models, cryptography in practice, memory safety and web security."),
  C("CS 410", "Distributed Systems", 4, ["CS 310"], ["cs-elective"], 3.8, 0.23, "Consensus, replication, fault tolerance and large-scale storage."),
  C("CS 420", "Compilers", 4, ["CS 350"], ["cs-elective"], 3.7, 0.21, "Lexing, parsing, type checking, intermediate representations and code generation."),
  C("CS 450", "Senior Capstone", 4, ["CS 230", "CS 220"], ["capstone"], 4.5, 0.47, "A two-term team project for a real client, from scoping to delivery."),
  C("MATH 150", "Calculus I", 4, [], ["math-core"], 3.8, 0.27, "Limits, derivatives and integrals of one variable."),
  C("MATH 151", "Calculus II", 4, ["MATH 150"], ["math-core"], 3.6, 0.23, "Integration techniques, sequences and series."),
  C("MATH 210", "Discrete Mathematics", 4, ["MATH 150"], ["math-core"], 3.9, 0.3, "Logic, proof, sets, combinatorics and graphs."),
  C("MATH 220", "Linear Algebra", 4, ["MATH 151"], ["math-core"], 3.7, 0.25, "Vectors, matrices, eigenvalues and their applications."),
  C("STAT 250", "Statistics for Data Science", 4, ["MATH 150"], ["math-core"], 4.0, 0.32, "Probability, inference and regression with real datasets in R."),
  C("ENGL 120", "Academic Writing", 3, [], ["gen-ed"], 4.2, 0.4, "Argument, evidence and revision across disciplines."),
  C("HIST 205", "Modern World History", 3, [], ["gen-ed"], 4.1, 0.37, "Global history from 1750 through empires, revolutions and the digital age."),
  C("PHIL 230", "Ethics of Technology", 3, [], ["gen-ed"], 4.5, 0.42, "Privacy, automation, fairness and responsibility in computing."),
  C("PSYC 101", "Introduction to Psychology", 3, [], ["gen-ed"], 4.0, 0.36, "Mind and behaviour: perception, memory, development and social psychology."),
  C("ECON 101", "Principles of Microeconomics", 3, [], ["gen-ed"], 3.8, 0.3, "Markets, incentives, and the choices of firms and households."),
  C("ART 140", "Visual Design Foundations", 3, [], ["gen-ed"], 4.4, 0.45, "Composition, typography and colour through weekly studio projects."),
  C("MUS 110", "Music and Culture", 3, [], ["gen-ed"], 4.3, 0.48, "Listening to and writing about music across traditions."),
  C("PHYS 180", "Physics I: Mechanics", 4, ["MATH 150"], ["gen-ed"], 3.6, 0.24, "Motion, forces, energy and momentum with weekly labs."),
  C("BIO 110", "Biology of Cells", 4, [], ["gen-ed"], 3.9, 0.29, "Cell structure, genetics and evolution with laboratory work."),
  C("COMM 210", "Public Speaking", 3, [], ["gen-ed"], 4.2, 0.43, "Preparing, delivering and critiquing speeches for different audiences."),
];

export const courseByCode = new Map(courses.map((c) => [c.code, c]));

export const programs: Program[] = [
  {
    id: "cs-bs",
    title: "B.S. Computer Science",
    totalCredits: 120,
    requirements: [
      { id: "cs-core", title: "Computer science core", courses: ["CS 101", "CS 150", "CS 210", "CS 220", "CS 230", "CS 310", "CS 320"] },
      { id: "math-core", title: "Mathematics and statistics", courses: ["MATH 150", "MATH 151", "MATH 210", "MATH 220", "STAT 250"] },
      { id: "cs-electives", title: "Computer science electives", choose: 4, courses: courses.filter((c) => c.attributes.includes("cs-elective")).map((c) => c.code) },
      { id: "capstone", title: "Senior capstone", courses: ["CS 450"] },
      { id: "gen-ed", title: "General education", choose: 5, courses: courses.filter((c) => c.attributes.includes("gen-ed")).map((c) => c.code) },
    ],
  },
];

// ---------------------------------------------------------------- deterministic randomness
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20270112);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

// ---------------------------------------------------------------- sections
const MWF_SLOTS = [t(8), t(9), t(10), t(11), t(12), t(13), t(14), t(15)].map((s) => ({ days: ["M", "W", "F"] as Day[], start: s, end: s + 50 }));
const TR_SLOTS = [t(8), t(9, 30), t(11), t(12, 30), t(14), t(15, 30), t(17)].map((s) => ({ days: ["T", "R"] as Day[], start: s, end: s + 75 }));
const EVENING = [{ days: ["M", "W"] as Day[], start: t(18), end: t(19, 15) }];
const INSTRUCTORS = [
  "Priya Raman", "Tomás Herrera", "Hannah Weiss", "Kwame Asante", "Mei Lin", "Jonah Brooks", "Farah Siddiqui",
  "Lucas Moreau", "Ingrid Dahl", "Samuel Okoro", "Rosa Delgado", "Ethan Park", "Leila Haddad", "Grace Whitfield",
];
const BUILDINGS = ["Keller Hall", "Nash Science", "Adams Library", "Rowe Center", "Pike Hall"];

// Sections pinned so the personas' stories are stable regardless of the random fill.
const PINNED: Record<string, Partial<Section>[]> = {
  "CS 220": [
    { meeting: { days: ["M", "W", "F"], start: t(10), end: t(10, 50) }, instructor: "Priya Raman", capacity: 60, enrolled: 58, waitlist: 6 },
    { meeting: { days: ["T", "R"], start: t(14), end: t(15, 15) }, instructor: "Ethan Park", capacity: 45, enrolled: 31, waitlist: 0 },
  ],
  "MATH 220": [
    { meeting: { days: ["T", "R"], start: t(11), end: t(12, 15) }, instructor: "Ingrid Dahl", capacity: 40, enrolled: 36, waitlist: 0 },
    { meeting: { days: ["M", "W", "F"], start: t(13), end: t(13, 50) }, instructor: "Samuel Okoro", capacity: 40, enrolled: 22, waitlist: 0 },
  ],
  "CS 370": [
    { meeting: { days: ["T", "R"], start: t(14), end: t(15, 15) }, instructor: "Grace Whitfield", capacity: 35, enrolled: 35, waitlist: 11 },
    { meeting: { days: ["M", "W"], start: t(18), end: t(19, 15) }, instructor: "Leila Haddad", capacity: 30, enrolled: 18, waitlist: 0, modality: "hybrid" },
  ],
  "STAT 250": [
    { meeting: { days: ["M", "W", "F"], start: t(9), end: t(9, 50) }, instructor: "Rosa Delgado", capacity: 50, enrolled: 44, waitlist: 0 },
    { meeting: { days: ["T", "R"], start: t(15, 30), end: t(16, 45) }, instructor: "Mei Lin", capacity: 50, enrolled: 29, waitlist: 0 },
  ],
  "CS 310": [
    { meeting: { days: ["M", "W", "F"], start: t(11), end: t(11, 50) }, instructor: "Kwame Asante", capacity: 50, enrolled: 50, waitlist: 9 },
  ],
  "CS 320": [
    { meeting: { days: ["T", "R"], start: t(9, 30), end: t(10, 45) }, instructor: "Hannah Weiss", capacity: 45, enrolled: 27, waitlist: 0 },
  ],
};

export const sections: Section[] = [];
for (const course of courses) {
  const pinned = PINNED[course.code];
  const count = pinned?.length ?? (course.level >= 300 ? 1 + Math.round(rand() * 0.7) : 2 + Math.round(rand()));
  for (let i = 0; i < count; i++) {
    const meeting = pick(rand() < 0.1 ? EVENING : rand() < 0.5 ? MWF_SLOTS : TR_SLOTS);
    const capacity = course.level >= 300 ? pick([30, 35, 40, 45]) : pick([40, 60, 80, 120]);
    const fill = between(0.45, 1.08);
    const enrolled = Math.min(capacity, Math.round(capacity * fill));
    const base: Section = {
      id: `${course.code.replace(" ", "")}-${String(i + 1).padStart(2, "0")}`,
      course: course.code,
      number: String(i + 1).padStart(2, "0"),
      instructor: pick(INSTRUCTORS),
      meeting,
      room: `${pick(BUILDINGS)} ${100 + Math.floor(rand() * 300)}`,
      modality: rand() < 0.12 ? "online" : rand() < 0.1 ? "hybrid" : "in-person",
      capacity,
      enrolled,
      waitlist: fill > 1 ? Math.round((fill - 1) * capacity) + Math.floor(rand() * 4) : 0,
    };
    sections.push({ ...base, ...(pinned?.[i] ?? {}) });
  }
}
export const sectionById = new Map(sections.map((s) => [s.id, s]));
const sectionById0 = sectionById;
const overlapsMeeting = (a: Meeting, b: Meeting) => a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end;

// ---------------------------------------------------------------- people
const FIRST = [
  "Aiden", "Beatriz", "Chidi", "Dana", "Elif", "Felix", "Gabriela", "Hiro", "Isla", "Jamal", "Keira", "Luis", "Mira",
  "Nikolai", "Olivia", "Pranav", "Quinn", "Rania", "Soren", "Tariq", "Uma", "Vera", "Wes", "Ximena", "Yusuf", "Zara",
  "Arjun", "Bianca", "Caleb", "Delia", "Emeka", "Freya", "Gideon", "Hana", "Ilan", "Jade",
];
const LAST = [
  "Abara", "Bauer", "Castillo", "Dubois", "Eriksen", "Fofana", "Gupta", "Hoang", "Ibrahim", "Jensen", "Kowalski",
  "Larsen", "Mensah", "Nakamura", "Oduya", "Petrov", "Quintero", "Rossi", "Sato", "Tan", "Usman", "Varga", "Walsh",
  "Xu", "Yilmaz", "Zamora",
];

const REQUIRED_ORDER = ["CS 101", "MATH 150", "ENGL 120", "CS 150", "MATH 151", "MATH 210", "PSYC 101", "CS 210", "CS 230", "STAT 250", "HIST 205", "CS 220", "MATH 220", "CS 330", "CS 310", "PHIL 230", "CS 320", "CS 370", "CS 390", "ECON 101", "CS 350", "CS 340"];

export const ADVISOR_ID = "A-07";
export const MAYA_ID = "S-1042";
export const SAM_ID = "S-1107";

const maya: Student = {
  id: MAYA_ID,
  name: "Maya Chen",
  year: 3,
  program: "cs-bs",
  gpa: 3.42,
  completed: ["CS 101", "CS 150", "CS 210", "CS 230", "CS 330", "MATH 150", "MATH 151", "MATH 210", "ENGL 120", "PSYC 101", "HIST 205"],
  planned: ["CS220-01", "MATH220-01", "CS370-01"],
  planStatus: "draft",
  holds: [],
  blocked: [{ days: ["M", "W", "F"], start: t(8), end: t(12), label: "Library shift" }],
  advisor: ADVISOR_ID,
  lastContact: "2026-09-14",
};

const sam: Student = {
  id: SAM_ID,
  name: "Sam Rivera",
  year: 1,
  program: "cs-bs",
  gpa: 3.61,
  completed: ["CS 101", "MATH 150", "ENGL 120"],
  planned: [],
  planStatus: "not-started",
  holds: [],
  blocked: [],
  advisor: ADVISOR_ID,
  lastContact: "2026-08-30",
};

const HOLD_NOTES: Record<Hold["kind"], string> = {
  financial: "Tuition balance past due",
  advising: "Advising meeting required before registration",
  immunization: "Missing immunization record",
  conduct: "Pending conduct review",
};

export const students: Student[] = [maya, sam];
for (let i = 0; i < 36; i++) {
  const year = pick([1, 2, 2, 3, 3, 3, 4, 4]) as Student["year"];
  const done = Math.min(REQUIRED_ORDER.length, year * 5 + Math.floor(between(-2, 3)));
  const completed = REQUIRED_ORDER.slice(0, Math.max(2, done));
  const candidates = courses.filter((c) => !completed.includes(c.code) && c.prereqs.every((p) => completed.includes(p)));
  const plannedCount = rand() < 0.12 ? 0 : rand() < 0.15 ? 2 : pick([4, 4, 4, 5]);
  const planned: string[] = [];
  for (const c of candidates.sort(() => rand() - 0.5).slice(0, plannedCount)) {
    // Most students build a plan without clashes; a few don't.
    const secs = sections.filter((s) => s.course === c.code);
    const clear = secs.filter((s) => !planned.some((id) => overlapsMeeting(sectionById0.get(id)!.meeting, s.meeting)));
    planned.push(pick(clear.length && rand() < 0.93 ? clear : secs).id);
  }
  const holds: Hold[] = [];
  if (rand() < 0.14) holds.push({ kind: "financial", note: HOLD_NOTES.financial });
  if (rand() < 0.1) holds.push({ kind: "advising", note: HOLD_NOTES.advising });
  if (rand() < 0.05) holds.push({ kind: "immunization", note: HOLD_NOTES.immunization });
  const gpa = Math.round(Math.min(4, Math.max(1.8, between(2.0, 4.1))) * 100) / 100;
  students.push({
    id: `S-${1110 + i * 7}`,
    name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    year,
    program: "cs-bs",
    gpa,
    completed,
    planned,
    planStatus: planned.length === 0 ? "not-started" : pick(["draft", "draft", "submitted", "submitted", "approved"]),
    holds,
    blocked: [],
    advisor: ADVISOR_ID,
    lastContact: `2026-${pick(["07", "08", "09", "09", "10"])}-${String(1 + Math.floor(rand() * 27)).padStart(2, "0")}`,
  });
}
export const studentById = new Map(students.map((s) => [s.id, s]));

export const advisors: Advisor[] = [
  { id: ADVISOR_ID, name: "Dr. Adaeze Okafor", dept: "Computer Science", advisees: students.map((s) => s.id) },
];
export const advisorById = new Map(advisors.map((a) => [a.id, a]));

const REASONS: Record<OverrideRequest["kind"], string[]> = {
  prerequisite: [
    "Taking the missing prerequisite concurrently this term.",
    "Completed equivalent coursework at my previous college.",
    "Instructor said I could join if my advisor approves.",
  ],
  capacity: ["Section is full and it is the only time that fits my work schedule.", "Need this course to graduate on time."],
  "credit-overload": ["Want to finish a term early; GPA above 3.5 last term.", "Need 20 credits to stay on track after a medical leave."],
};

export const overrideRequests: OverrideRequest[] = [
  {
    id: "OR-301",
    student: MAYA_ID,
    course: "CS 360",
    kind: "prerequisite",
    reason: "Taking STAT 250 and MATH 220 this spring; research lab needs ML background by summer.",
    submitted: "2026-10-21",
    status: "pending",
  },
];
students.slice(2).forEach((s, i) => {
  if (rand() < 0.32) {
    const kind = pick<OverrideRequest["kind"]>(["prerequisite", "prerequisite", "capacity", "credit-overload"]);
    const course = pick(courses.filter((c) => c.level >= 200 && !s.completed.includes(c.code)));
    overrideRequests.push({
      id: `OR-${310 + i}`,
      student: s.id,
      course: course.code,
      kind,
      reason: pick(REASONS[kind]),
      submitted: `2026-10-${String(8 + Math.floor(rand() * 19)).padStart(2, "0")}`,
      status: rand() < 0.75 ? "pending" : pick(["approved", "denied"]),
    });
  }
});

export const dataset = { term: TERM, courses, sections, programs, students, advisors, overrideRequests };
export type Dataset = typeof dataset;

// ---------------------------------------------------------------- derived facts
export const fmtTime = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};
export const fmtMeeting = (m: Meeting) => `${m.days.join("")} ${fmtTime(m.start)}–${fmtTime(m.end)}`;
export const timeOfDay = (m: Meeting): "morning" | "afternoon" | "evening" =>
  m.start < t(12) ? "morning" : m.start < t(17) ? "afternoon" : "evening";

export function overlaps(a: Meeting, b: Meeting) {
  return a.days.some((d) => b.days.includes(d)) && a.start < b.end && b.start < a.end;
}

export type RequirementStatus = Requirement & { needed: number; done: string[]; planned: string[]; remaining: string[] };

export function requirementStatus(student: Student): RequirementStatus[] {
  const program = programs.find((p) => p.id === student.program)!;
  const plannedCourses = student.planned.map((id) => sectionById.get(id)?.course).filter(Boolean) as string[];
  return program.requirements.map((r) => {
    const needed = r.choose ?? r.courses.length;
    const done = r.courses.filter((c) => student.completed.includes(c)).slice(0, needed);
    const planned = r.courses.filter((c) => plannedCourses.includes(c)).slice(0, Math.max(0, needed - done.length));
    const remaining = r.courses.filter((c) => !student.completed.includes(c) && !plannedCourses.includes(c));
    return { ...r, needed, done, planned, remaining };
  });
}

export function creditsOf(courseCodes: string[]) {
  return courseCodes.reduce((sum, c) => sum + (courseByCode.get(c)?.credits ?? 0), 0);
}

export function plannedSections(student: Student) {
  return student.planned.map((id) => sectionById.get(id)).filter(Boolean) as Section[];
}

export type Conflict = { a: string; b: string; label: string };
export function scheduleConflicts(student: Student, planned = plannedSections(student)): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++)
      if (overlaps(planned[i].meeting, planned[j].meeting))
        out.push({ a: planned[i].id, b: planned[j].id, label: `${planned[i].course} overlaps ${planned[j].course}` });
    for (const block of student.blocked)
      if (overlaps(planned[i].meeting, block)) out.push({ a: planned[i].id, b: block.label, label: `${planned[i].course} overlaps ${block.label.toLowerCase()}` });
  }
  return out;
}

export function missingPrereqs(student: Student, code: string) {
  return (courseByCode.get(code)?.prereqs ?? []).filter((p) => !student.completed.includes(p));
}

/** Signals an advisor triages on. Arithmetic lives here, never in a model. */
export function adviseeRisk(student: Student) {
  const planned = plannedSections(student);
  const credits = creditsOf(planned.map((s) => s.course));
  const status = requirementStatus(student);
  const remainingCourses = status.reduce((n, r) => n + Math.max(0, r.needed - r.done.length - r.planned.length), 0);
  const termsLeft = Math.max(1, (4 - student.year) * 2 + 1);
  const flags: string[] = [];
  if (student.holds.length) flags.push(student.holds.length > 1 ? `Holds (${student.holds.length})` : "Hold");
  if (credits < 12) flags.push("Under 12 credits");
  if (student.gpa < 2.3) flags.push("GPA below 2.3");
  if (remainingCourses / termsLeft > 4.2) flags.push("Off track to graduate");
  if (scheduleConflicts(student, planned).length) flags.push("Schedule conflict");
  if (student.planStatus === "not-started") flags.push("No plan");
  return { credits, remainingCourses, termsLeft, flags, score: flags.length };
}
