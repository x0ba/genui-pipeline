import { ADVISOR_ID, MAYA_ID, SAM_ID } from "./data";
import type { Subject } from "./spec";

export type Persona = {
  id: string;
  name: string;
  /** How the UI refers to them in running text. */
  short: string;
  role: string;
  subject: Subject;
  /** What the person says they need, in their words. */
  intake: string;
  /** How they actually used the product, from logs. */
  signals: string;
  /** Requests for the demo's ask bar. Some are deliberately outside any spec. */
  suggestions: string[];
};

export const PERSONAS: Persona[] = [
  {
    id: "maya",
    name: "Maya Chen",
    short: "Maya",
    role: "Student, B.S. Computer Science, third year",
    subject: { kind: "student", id: MAYA_ID },
    intake:
      "I'm a third-year CS major. I work at the campus library Monday, Wednesday and Friday from 8 to noon, so on those days I can only take classes in the afternoon. I plan my semester on my phone between shifts. I always check a section's time against my week first, then the instructor rating. Waitlists stress me out, so I avoid full sections. I want to graduate on time and always know which requirements I still need.",
    signals:
      "Last term: opened the weekly schedule 41 times, compared sections of the same course 27 times, checked degree progress 18 times, used catalog search 6 times. 78% of sessions were on a phone.",
    suggestions: [
      "What fits around my library shifts?",
      "Show my week",
      "What do I still need to graduate?",
      "Show how prerequisites chain from what I've taken to the capstone",
    ],
  },
  {
    id: "okafor",
    name: "Dr. Adaeze Okafor",
    short: "Dr. Okafor",
    role: "Academic advisor, Computer Science, 38 advisees",
    subject: { kind: "advisor", id: ADVISOR_ID },
    intake:
      "I advise 38 computer science undergraduates. During registration I review every advisee's plan, approve or deny prerequisite and capacity overrides, and chase students who are off track to graduate, have holds, or are under 12 credits. I work at a large desktop monitor and want dense tables I can sort and act on in bulk. I rarely browse the catalog, except to check whether a section still has seats.",
    signals:
      "Last registration period: 212 override decisions, 64 bulk reminder emails, sorted the roster by flags 90% of the time, opened the course catalog 9 times. All sessions on desktop.",
    suggestions: [
      "Who needs my attention before registration opens?",
      "Clear the pending override requests",
      "Which courses will my advisees get waitlisted in?",
      "Show a heatmap of when my advisees' planned classes meet across the week",
    ],
  },
  {
    id: "sam",
    name: "Sam Rivera",
    short: "Sam",
    role: "Student, first year",
    subject: { kind: "student", id: SAM_ID },
    intake:
      "I'm a first-year student taking the usual first-year courses. I just want to find classes, see my schedule, and register.",
    signals: "New student. No usage history yet.",
    suggestions: ["Find an afternoon gen-ed", "Show my week", "What do I still need to graduate?"],
  },
];

export const personaById = new Map(PERSONAS.map((p) => [p.id, p]));
