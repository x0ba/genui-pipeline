import {
  adviseeRisk,
  advisorById,
  fmtMeeting,
  overrideRequests,
  plannedSections,
  requirementStatus,
  scheduleConflicts,
  studentById,
  TERM,
} from "../../shared/data";
import type { Persona } from "../../shared/personas";

/** What the agents know about the user: their words, their behaviour, their data. */
export function describeUser(persona: Persona) {
  const base = {
    name: persona.name,
    role: persona.subject.kind,
    description: persona.role,
    needs_in_their_words: persona.intake,
    usage_signals: persona.signals,
    term: TERM,
  };
  if (persona.subject.kind === "student") {
    const s = studentById.get(persona.subject.id)!;
    return {
      ...base,
      data: {
        year: s.year,
        gpa: s.gpa,
        completed: s.completed,
        planned_sections: plannedSections(s).map((sec) => `${sec.id} ${sec.course} ${fmtMeeting(sec.meeting)} (${sec.enrolled}/${sec.capacity}, waitlist ${sec.waitlist})`),
        blocked_times: s.blocked.map((b) => `${b.label}: ${fmtMeeting(b)}`),
        conflicts: scheduleConflicts(s).map((c) => c.label),
        requirements: requirementStatus(s).map((r) => `${r.title}: ${r.done.length} done, ${r.planned.length} planned, ${Math.max(0, r.needed - r.done.length - r.planned.length)} remaining`),
        holds: s.holds,
      },
    };
  }
  const advisor = advisorById.get(persona.subject.id)!;
  const risks = advisor.advisees.map((id) => adviseeRisk(studentById.get(id)!));
  return {
    ...base,
    data: {
      advisees: advisor.advisees.length,
      advisees_with_flags: risks.filter((r) => r.score > 0).length,
      flag_counts: risks.flatMap((r) => r.flags).reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.replace(/^\d+ /, "")]: (acc[f.replace(/^\d+ /, "")] ?? 0) + 1 }), {}),
      pending_override_requests: overrideRequests.filter((o) => o.status === "pending" && advisor.advisees.includes(o.student)).length,
    },
  };
}
