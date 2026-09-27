import { Component, lazy, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import type { ComponentDef } from "../../../shared/spec";
import AdviseeDetail from "../components/advisee-detail";
import AdviseeTable from "../components/advisee-table";
import ApprovalQueue from "../components/approval-queue";
import CourseDetail from "../components/course-detail";
import CourseSearch from "../components/course-search";
import DeadlineBanner from "../components/deadline-banner";
import DegreeProgress from "../components/degree-progress";
import DemandChart from "../components/demand-chart";
import PlanCart from "../components/plan-cart";
import StatStrip from "../components/stat-strip";
import WeekCalendar from "../components/week-calendar";

declare const __GENERATED_DIR__: string;

export type SlotComponent = ComponentType<{ props: Record<string, string> }>;

const BUILTINS: Record<string, SlotComponent> = {
  "course-search": CourseSearch,
  "course-detail": CourseDetail,
  "week-calendar": WeekCalendar,
  "plan-cart": PlanCart,
  "degree-progress": DegreeProgress,
  "stat-strip": StatStrip,
  "deadline-banner": DeadlineBanner,
  "advisee-table": AdviseeTable,
  "advisee-detail": AdviseeDetail,
  "approval-queue": ApprovalQueue,
  "demand-chart": DemandChart,
};

// Generated components are written by Claude after the app has loaded, so they
// are imported at runtime through Vite's /@fs/ route rather than bundled.
const generated = new Map<string, SlotComponent>();

export function componentFor(def: ComponentDef): SlotComponent | null {
  if (def.source === "builtin") return BUILTINS[def.id] ?? null;
  const key = `${def.id}@${def.origin?.createdAt ?? ""}`;
  if (!generated.has(key)) {
    // Numeric cache-buster: a '.' in the query would confuse Vite's language detection.
    // `t=`, not `v=`: Vite serves `v=` URLs as immutable, so the browser would keep a
    // module that imports a React bundle from before Vite last re-optimized deps.
    const url = `/@fs${__GENERATED_DIR__}/${def.id}.tsx?t=${Date.parse(def.origin?.createdAt ?? "") || 0}`;
    generated.set(key, lazy(() => import(/* @vite-ignore */ url)));
  }
  return generated.get(key)!;
}

export class SlotBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`slot ${this.props.name} failed`, error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <p data-state="error">
          {this.props.name} could not render: {this.state.error.message}
        </p>
      );
    return this.props.children;
  }
}
