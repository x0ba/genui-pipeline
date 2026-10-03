import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { courseByCode, courses, missingPrereqs, sectionById, sections, TERM, useSelection, useStudent, useSubject } from "@kit";

type Props = { props: Record<string, string> };
type Status = "done" | "planned" | "ready" | "after" | "blocked";
type Info = { status: Status; missing: string[] };
type TreeNode = { key: string; code: string; depth: number; parentKeys: string[]; hasKids: boolean; repeat: boolean };

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Marker({ status }: { status: Status }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true as const, style: { flex: "none" } };
  if (status === "done") return <svg {...common}><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>;
  if (status === "planned")
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 1.5 A4.5 4.5 0 0 1 6 10.5 Z" fill="currentColor" />
      </svg>
    );
  if (status === "ready") return <svg {...common}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--vbg-text-secondary)" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

function seatInfo(code: string): { text: string; short: string; warn: boolean } {
  const secs = sections.filter((s) => s.course === code);
  if (secs.length === 0) return { text: `Not offered in ${TERM.name}`, short: "not offered", warn: false };
  const open = secs.reduce((n, s) => n + Math.max(0, s.capacity - s.enrolled), 0);
  const wait = secs.reduce((n, s) => n + s.waitlist, 0);
  if (open === 0) return { text: `${TERM.name}: ${count(secs.length, "section")}, all full, waitlist ${wait}`, short: `full, waitlist ${wait}`, warn: true };
  return {
    text: `${TERM.name}: ${count(secs.length, "section")}, ${count(open, "open seat")}${wait ? `, waitlist ${wait}` : ""}`,
    short: `${open} open`,
    warn: false,
  };
}

export default function PrereqChain({ props }: Props) {
  const content = props.content ?? "status";
  const expandBy = props.expandBy ?? "remaining";
  const density = props.density ?? "comfortable";
  const subject = useSubject();
  const selection = useSelection();
  const sid = subject.kind === "student" ? subject.id : selection.student ?? subject.advisees[0]?.id ?? "";
  const student = useStudent(sid);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const model = useMemo(() => {
    if (!student) return null;
    const done = new Set(student.completed);
    const plannedCodes = new Set(
      student.planned.map((id) => sectionById.get(id)?.course).filter((c): c is string => typeof c === "string"),
    );
    const prereqsOf = (code: string) => courseByCode.get(code)?.prereqs ?? [];
    const infoOf = (code: string): Info => {
      if (done.has(code)) return { status: "done", missing: [] };
      if (plannedCodes.has(code)) return { status: "planned", missing: [] };
      const missing = missingPrereqs(student, code);
      if (missing.length === 0) return { status: "ready", missing };
      if (missing.every((m) => plannedCodes.has(m))) return { status: "after", missing };
      return { status: "blocked", missing };
    };
    const roots = courses.filter((c) => c.attributes.includes("capstone")).map((c) => c.code);

    const memo = new Map<string, string[]>();
    const chain = (code: string, stack: Set<string>): string[] => {
      if (done.has(code)) return [];
      const hit = memo.get(code);
      if (hit) return hit;
      if (stack.has(code)) return [code];
      stack.add(code);
      let best: string[] = [];
      for (const p of prereqsOf(code)) {
        const c = chain(p, stack);
        if (c.length > best.length) best = c;
      }
      stack.delete(code);
      const out = [...best, code];
      memo.set(code, out);
      return out;
    };
    const chains = roots.map((r) => ({ root: r, chain: chain(r, new Set()) }));
    const critical = new Set(chains.flatMap((c) => c.chain));

    const nodes: TreeNode[] = [];
    const seen = new Set<string>();
    const walk = (code: string, depth: number, parentKeys: string[], path: string[]) => {
      const key = [...path, code].join(">");
      const kids = prereqsOf(code).filter((p) => p !== code && !path.includes(p));
      const repeat = seen.has(code) && kids.length > 0;
      seen.add(code);
      nodes.push({ key, code, depth, parentKeys, hasKids: kids.length > 0 && !repeat, repeat });
      if (repeat) return;
      for (const k of kids) walk(k, depth + 1, [...parentKeys, key], [...path, code]);
    };
    roots.forEach((r) => walk(r, 0, [], []));

    const infos = new Map<string, Info>();
    for (const n of nodes) if (!infos.has(n.code)) infos.set(n.code, infoOf(n.code));
    return { roots, chains, critical, nodes, infos };
  }, [student]);

  if (!student) return <p className="vbg-meta">Select a student to see how prerequisites lead to the capstone.</p>;
  if (!model || model.roots.length === 0) return <p className="vbg-meta">No capstone course is listed in the catalog.</p>;

  const { chains, critical, nodes, infos } = model;
  const defaultCollapsed = (n: TreeNode) => {
    const st = infos.get(n.code)?.status;
    if (expandBy === "all") return false;
    if (expandBy === "remaining") return st === "done";
    return !(critical.has(n.code) && st !== "done");
  };
  const collapsedOf = (n: TreeNode) => overrides[`${expandBy}|${n.key}`] ?? defaultCollapsed(n);
  const collapsedKeys = new Set(nodes.filter((n) => n.hasKids && collapsedOf(n)).map((n) => n.key));
  const visible = nodes.filter((n) => !n.parentKeys.some((k) => collapsedKeys.has(k)));
  const toggle = (n: TreeNode) => setOverrides((o) => ({ ...o, [`${expandBy}|${n.key}`]: !collapsedOf(n) }));

  const statusText = (info: Info, short: boolean) => {
    const miss = info.missing.join(", ");
    switch (info.status) {
      case "done":
        return short ? "completed" : "Completed";
      case "planned":
        return short ? "planned" : `Planned for ${TERM.name}`;
      case "ready":
        return short ? "ready" : "Ready to take: prerequisites met";
      case "after":
        return short ? `after ${miss}` : `Ready after ${TERM.name}, once ${miss} is done`;
      default:
        return short ? `needs ${miss}` : `Needs ${miss} first`;
    }
  };

  const compact = density === "compact";

  return (
    <div className="vbg-custom-stack-4">
      <div className="vbg-custom-stack-2">
        {chains.map(({ root, chain }) =>
          chain.length === 0 ? (
            <p key={root}>{root} is completed.</p>
          ) : (
            <p key={root}>
              The longest unfinished chain to {root} has {count(chain.length, "course")}: {chain.join(" → ")}. At one link per term, {root} is at least{" "}
              {count(chain.length, "term")} away, counting {TERM.name}.
            </p>
          ),
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <ul role="tree" aria-label="Prerequisites leading to the capstone" className="vbg-custom-plain" style={{ minWidth: compact ? 260 : 280 }}>
          {visible.map((n) => {
            const info = infos.get(n.code) ?? { status: "blocked" as Status, missing: [] };
            const course = courseByCode.get(n.code);
            const collapsed = collapsedKeys.has(n.key);
            const seats = content === "seats" && info.status !== "done" ? seatInfo(n.code) : null;
            const onPath = critical.has(n.code) && info.status !== "done";
            return (
              <motion.li
                layout
                key={n.key}
                role="treeitem"
                aria-level={n.depth + 1}
                aria-expanded={n.hasKids ? !collapsed : undefined}
                style={{ paddingLeft: `calc(${n.depth} * var(--vbg-space-4))` }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: compact ? "center" : "flex-start",
                    gap: "var(--vbg-space-2)",
                    paddingBlock: compact ? "var(--vbg-space-1)" : "var(--vbg-space-2)",
                    paddingLeft: n.depth ? "var(--vbg-space-2)" : 0,
                    borderLeft: n.depth ? "1px solid var(--vbg-border-subtle)" : undefined,
                    minHeight: compact ? undefined : 44,
                  }}
                >
                  {n.hasKids ? (
                    <button
                      type="button"
                      className="vbg-custom-text-button"
                      aria-label={`${collapsed ? "Show" : "Hide"} prerequisites of ${n.code}`}
                      onClick={() => toggle(n)}
                      style={{ width: "1.5em", flex: "none" }}
                    >
                      {collapsed ? "▸" : "▾"}
                    </button>
                  ) : (
                    <span aria-hidden="true" style={{ width: "1.5em", flex: "none" }} />
                  )}
                  <span style={{ paddingTop: compact ? 0 : "0.3em", display: "flex" }}>
                    <Marker status={info.status} />
                  </span>
                  {compact ? (
                    <span style={{ display: "flex", gap: "var(--vbg-space-2)", alignItems: "baseline", minWidth: 0 }}>
                      <button type="button" className="vbg-custom-text-button" onClick={() => selection.selectCourse(n.code)} title={course?.title}>
                        {n.code}
                      </button>
                      <span className="vbg-meta">
                        {statusText(info, true)}
                        {n.repeat ? ", see above" : ""}
                      </span>
                      {seats && (
                        <span className="vbg-meta" data-state={seats.warn ? "warning" : undefined}>
                          {seats.short}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="vbg-custom-stack-2" style={{ minWidth: 0 }}>
                      <span>
                        <button type="button" className="vbg-custom-text-button" onClick={() => selection.selectCourse(n.code)}>
                          {n.code}
                        </button>{" "}
                        {course?.title ?? ""}
                      </span>
                      <span className="vbg-meta">
                        {statusText(info, false)}
                        {onPath ? ". On the longest chain" : ""}
                        {n.repeat ? ". Its prerequisites are shown above" : ""}
                      </span>
                      {seats && (
                        <span className="vbg-meta" data-state={seats.warn ? "warning" : undefined}>
                          {seats.text}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
      <p className="vbg-caption">
        Filled circle: completed. Half circle: planned for {TERM.name}. Open circle: ready to take. Dashed circle: prerequisites still missing.
      </p>
    </div>
  );
}
