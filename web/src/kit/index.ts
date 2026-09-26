// @kit: everything a component may use besides react and motion/react.
// Built-in components use it too, so generated ones read and write the same state.
import { useCallback, useMemo } from "react";
import {
  adviseeRisk,
  advisorById,
  courseByCode,
  dataset,
  overrideRequests,
  sectionById,
  studentById,
  type Student,
} from "../../../shared/data";
import { useAppState, useStore } from "./store";

export * from "../../../shared/data";
export { KitProvider, useAppState, useStore } from "./store";

/** A student record with this session's plan edits applied. */
function live(s: Student, planned: Record<string, string[]>, status: Record<string, Student["planStatus"]>): Student {
  return { ...s, planned: planned[s.id] ?? s.planned, planStatus: status[s.id] ?? s.planStatus };
}

/** Who the interface is for. `student` is set for students, `advisor` + `advisees` for advisors. */
export function useSubject() {
  const subject = useAppState((s) => s.subject);
  const planned = useAppState((s) => s.planned);
  const status = useAppState((s) => s.planStatus);
  return useMemo(() => {
    if (subject.kind === "student") {
      return { kind: "student" as const, id: subject.id, student: live(studentById.get(subject.id)!, planned, status) };
    }
    const advisor = advisorById.get(subject.id)!;
    return {
      kind: "advisor" as const,
      id: subject.id,
      advisor,
      advisees: advisor.advisees.map((id) => live(studentById.get(id)!, planned, status)),
    };
  }, [subject, planned, status]);
}

/** One student with live plan edits. */
export function useStudent(id: string | null) {
  const planned = useAppState((s) => s.planned);
  const status = useAppState((s) => s.planStatus);
  return useMemo(() => (id && studentById.has(id) ? live(studentById.get(id)!, planned, status) : null), [id, planned, status]);
}

/** The subject student's plan: sections, and actions to change or submit it. */
export function usePlan(studentId?: string) {
  const store = useStore();
  const subject = useAppState((s) => s.subject);
  const id = studentId ?? subject.id;
  const ids = useAppState((s) => s.planned[id]);
  const status = useAppState((s) => s.planStatus[id]);
  const sections = useMemo(() => (ids ?? []).map((x) => sectionById.get(x)!).filter(Boolean), [ids]);
  const notify = useNotify();
  const add = useCallback(
    (sectionId: string) => {
      const sec = sectionById.get(sectionId);
      if (!sec) return;
      store.set((s) => ({
        planned: { ...s.planned, [id]: [...(s.planned[id] ?? []).filter((x) => sectionById.get(x)?.course !== sec.course), sectionId] },
        planStatus: { ...s.planStatus, [id]: "draft" },
      }));
      notify(`Added ${sec.course} section ${sec.number} to the plan`);
    },
    [store, id, notify],
  );
  const remove = useCallback(
    (sectionId: string) => {
      store.set((s) => ({ planned: { ...s.planned, [id]: (s.planned[id] ?? []).filter((x) => x !== sectionId) }, planStatus: { ...s.planStatus, [id]: "draft" } }));
      notify(`Removed ${sectionById.get(sectionId)?.course ?? "section"} from the plan`);
    },
    [store, id, notify],
  );
  const submit = useCallback(() => {
    store.set((s) => ({ planStatus: { ...s.planStatus, [id]: "submitted" } }));
    notify("Plan submitted for advisor review");
  }, [store, id, notify]);
  return { sections, status: status ?? "not-started", add, remove, submit };
}

/** The selected course and student, shared between list and detail components. */
export function useSelection() {
  const store = useStore();
  const course = useAppState((s) => s.selectedCourse);
  const student = useAppState((s) => s.selectedStudent);
  const rows = useAppState((s) => s.selectedRows);
  return {
    course: course ? courseByCode.get(course) ?? null : null,
    student,
    rows,
    selectCourse: useCallback((code: string | null) => store.set({ selectedCourse: code }), [store]),
    selectStudent: useCallback((id: string | null) => store.set({ selectedStudent: id }), [store]),
    setRows: useCallback((ids: string[]) => store.set({ selectedRows: ids }), [store]),
  };
}

/** Override requests for the subject advisor's students, with live decisions. */
export function useOverrides() {
  const store = useStore();
  const subject = useAppState((s) => s.subject);
  const decisions = useAppState((s) => s.overrides);
  const notify = useNotify();
  const requests = useMemo(() => {
    const scope = subject.kind === "advisor" ? new Set(advisorById.get(subject.id)!.advisees) : new Set([subject.id]);
    return overrideRequests.filter((o) => scope.has(o.student)).map((o) => ({ ...o, status: decisions[o.id] ?? o.status }));
  }, [subject, decisions]);
  const decide = useCallback(
    (ids: string | string[], status: "approved" | "denied" | "pending") => {
      const list = Array.isArray(ids) ? ids : [ids];
      store.set((s) => ({ overrides: { ...s.overrides, ...Object.fromEntries(list.map((i) => [i, status])) } }));
      notify(`${list.length === 1 ? "Request" : `${list.length} requests`} ${status}`);
    },
    [store, notify],
  );
  return { requests, decide };
}

/** Transient confirmation line shown by the shell after an action. */
export function useNotify() {
  const store = useStore();
  return useCallback(
    (text: string) => {
      const id = Date.now() + Math.random();
      store.set((s) => ({ notices: [...s.notices.slice(-2), { id, text }] }));
      setTimeout(() => store.set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), 3200);
    },
    [store],
  );
}

export const risk = adviseeRisk;
export const data = dataset;

/** Linear scale for SVG geometry. */
export function scaleLinear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
