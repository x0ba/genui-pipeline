import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { dataset, overrideRequests, sectionById, studentById, type OverrideRequest, type Student } from "../../../shared/data";
import type { Subject } from "../../../shared/spec";

// Client-side app state shared by every component in a view, built-in or
// generated: what's planned, what's selected, which requests were decided.
export type AppState = {
  subject: Subject;
  planned: Record<string, string[]>;
  planStatus: Record<string, Student["planStatus"]>;
  overrides: Record<string, OverrideRequest["status"]>;
  selectedCourse: string | null;
  selectedStudent: string | null;
  selectedRows: string[];
  notices: { id: number; text: string }[];
};

export type Store = {
  get: () => AppState;
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createStore(subject: Subject): Store {
  let state: AppState = {
    subject,
    planned: Object.fromEntries(dataset.students.map((s) => [s.id, [...s.planned]])),
    planStatus: Object.fromEntries(dataset.students.map((s) => [s.id, s.planStatus])),
    overrides: Object.fromEntries(overrideRequests.map((o) => [o.id, o.status])),
    selectedCourse:
      subject.kind === "student" ? (sectionById.get(studentById.get(subject.id)?.planned[0] ?? "")?.course ?? "CS 220") : "CS 220",
    selectedStudent: null,
    selectedRows: [],
    notices: [],
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

const StoreContext = createContext<Store | null>(null);

export function KitProvider({ subject, children, store }: { subject: Subject; children: ReactNode; store?: Store }) {
  const [own] = useState(() => store ?? createStore(subject));
  return <StoreContext.Provider value={own}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("kit hooks must be used inside <KitProvider>");
  return store;
}

export function useAppState<T>(select: (s: AppState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
