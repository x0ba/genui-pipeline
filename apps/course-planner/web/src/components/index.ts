import { implement } from "@malleable/react";
import * as lib from "../../../shared/library";
import AdviseeDetail from "./advisee-detail";
import AdviseeTable from "./advisee-table";
import ApprovalQueue from "./approval-queue";
import CourseDetail from "./course-detail";
import CourseSearch from "./course-search";
import DeadlineBanner from "./deadline-banner";
import DegreeProgress from "./degree-progress";
import DemandChart from "./demand-chart";
import PlanCart from "./plan-cart";
import StatStrip from "./stat-strip";
import WeekCalendar from "./week-calendar";

export const components = [
  implement(lib.courseSearch, CourseSearch),
  implement(lib.courseDetail, CourseDetail),
  implement(lib.weekCalendar, WeekCalendar),
  implement(lib.planCart, PlanCart),
  implement(lib.degreeProgress, DegreeProgress),
  implement(lib.statStrip, StatStrip),
  implement(lib.deadlineBanner, DeadlineBanner),
  implement(lib.adviseeTable, AdviseeTable),
  implement(lib.adviseeDetail, AdviseeDetail),
  implement(lib.approvalQueue, ApprovalQueue),
  implement(lib.demandChart, DemandChart),
];
