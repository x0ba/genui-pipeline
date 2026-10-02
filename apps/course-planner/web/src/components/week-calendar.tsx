import type { PropsOf } from "@malleable/core";
import type { weekCalendar } from "../../../shared/library";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { courseByCode, DAY_NAMES, DAYS, enter, exit, fmtTime, overlaps, usePlan, useSelection, useSubject, type Day, type Meeting } from "@kit";

type Props = PropsOf<typeof weekCalendar>;
type Item = {
  key: string;
  label: string;
  detail: string;
  meeting: Meeting;
  kind: "class" | "blocked";
  conflict: boolean;
  course?: string;
  title?: string;
  room?: string;
};

const START = 8 * 60;
const END = 20 * 60;
const HOURS = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);
/** Blocks shorter than this get one line: two don't fit in the grid's height. */
const SHORT = 60;
/** "2pm", "9:30am": the block's place on the grid already says roughly when it is. */
const shortTime = (m: number) => fmtTime(m).replace(":00", "");

const clash = (a: Item, b: Item) => a.meeting.start < b.meeting.end && b.meeting.start < a.meeting.end;

type Open = { key: string; day: Day; el: HTMLElement; via: "hover" | "focus" | "tap" };
const HOVER_DELAY = 300;
/** Right after a card closes, hovering the next block opens its card at once, so scanning the week isn't slowed down. */
const WARM = 300;

/** The details card beside a block: after a short delay on hover, at once on keyboard focus, and on tap for touch. */
function useEventCard() {
  const [open, setOpen] = useState<Open | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const closedAt = useRef(0);
  const pointer = useRef("");

  const clear = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  };
  const hide = () => {
    clear();
    setOpen(null);
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    return () => {
      closedAt.current = Date.now();
    };
  }, [open]);
  // A tapped card stays until the next tap somewhere else.
  useEffect(() => {
    if (open?.via !== "tap") return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest(".vbg-custom-week-item"))) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const isOpen = (key: string, day: Day) => open?.key === key && open.day === day;

  const bind = (key: string, day: Day) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      pointer.current = e.pointerType;
    },
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      clear();
      const next: Open = { key, day, el: e.currentTarget, via: "hover" };
      if (open || Date.now() - closedAt.current < WARM) setOpen(next);
      else showTimer.current = window.setTimeout(() => setOpen(next), HOVER_DELAY);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      clear();
      if (open?.via === "hover") hideTimer.current = window.setTimeout(() => setOpen(null), 80);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.matches(":focus-visible")) return;
      clear();
      setOpen({ key, day, el: e.currentTarget, via: "focus" });
    },
    onBlur: () => {
      if (open?.via === "focus" && isOpen(key, day)) hide();
    },
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Escape") hide();
    },
    /** Touch has no hover, so a tap toggles the card. Call from the block's click handler. */
    tap: (el: HTMLElement) => {
      const touch = pointer.current === "touch" || pointer.current === "pen";
      pointer.current = "";
      if (!touch) return;
      clear();
      setOpen(isOpen(key, day) ? null : { key, day, el, via: "tap" });
    },
  });

  return { open, isOpen, bind };
}

type Placed = { item: Item; col: number; span: number; cols: number };

/** Side-by-side columns for overlapping items, like Google Calendar: each run of
    overlapping items splits the day's width, and an item widens into free columns to its right. */
function layoutDay(items: Item[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.meeting.start - b.meeting.start || b.meeting.end - a.meeting.end);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(0, ...cluster.map((p) => p.col)) + 1;
    for (const p of cluster) {
      p.cols = cols;
      let next = p.col + 1;
      while (next < cols && !cluster.some((o) => o.col === next && clash(o.item, p.item))) next++;
      p.span = next - p.col;
    }
    out.push(...cluster);
    cluster = [];
  };
  for (const item of sorted) {
    if (item.meeting.start >= clusterEnd) flush();
    let col = 0;
    while (cluster.some((p) => p.col === col && clash(p.item, item))) col++;
    cluster.push({ item, col, span: 1, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.meeting.end);
  }
  flush();
  return out;
}

export default function WeekCalendar(props: Props) {
  const subject = useSubject();
  const plan = usePlan();
  const { selectCourse } = useSelection();
  const card = useEventCard();
  const cardId = useId();
  const weekRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Beside the block, on whichever side has room; below or above it when the calendar is too narrow for either.
  useLayoutEffect(() => {
    const open = card.open;
    const el = cardRef.current;
    const week = weekRef.current;
    if (!open || !el || !week || !open.el.isConnected) return;
    const a = open.el.getBoundingClientRect();
    const w = week.getBoundingClientRect();
    const cw = el.offsetWidth;
    const ch = el.offsetHeight;
    const gap = 6;
    const right = a.right - w.left + gap;
    const leftSide = a.left - w.left - gap - cw;
    let left: number;
    let top: number;
    if (right + cw <= w.width || leftSide >= 0) {
      left = right + cw <= w.width ? right : leftSide;
      top = Math.max(0, Math.min(a.top - w.top, w.height - ch));
    } else {
      left = Math.max(0, Math.min(a.left - w.left, w.width - cw));
      const below = a.bottom - w.top + gap;
      top = below + ch <= w.height ? below : Math.max(0, a.top - w.top - gap - ch);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [card.open]);

  if (subject.kind !== "student") return <p className="vbg-meta">The weekly schedule is for students.</p>;
  const showBlocked = props.blocked !== "hide";

  const classes: Item[] = plan.sections.map((s) => ({
    key: s.id,
    label: s.course,
    detail: `${courseByCode.get(s.course)?.title ?? ""} · ${s.room}`,
    title: courseByCode.get(s.course)?.title,
    room: s.room,
    meeting: s.meeting,
    kind: "class",
    course: s.course,
    conflict:
      plan.sections.some((o) => o.id !== s.id && overlaps(o.meeting, s.meeting)) ||
      subject.student.blocked.some((b) => overlaps(b, s.meeting)),
  }));
  const blocked: Item[] = subject.student.blocked.map((b, i) => ({
    key: `blocked-${i}`,
    label: b.label,
    detail: "Blocked",
    meeting: b,
    kind: "blocked",
    conflict: false,
  }));
  const items = showBlocked ? [...blocked, ...classes] : classes;
  const conflicts = classes.filter((c) => c.conflict).length;

  const perDay = (day: Day) => items.filter((i) => i.meeting.days.includes(day)).sort((a, b) => a.meeting.start - b.meeting.start);

  // What the card says a block runs into that day, hidden blocked time included, since it still counts as a conflict.
  const clashesOn = (item: Item, day: Day) =>
    [...blocked, ...classes]
      .filter((o) => o.key !== item.key && o.meeting.days.includes(day) && clash(o, item))
      .map((o) => (o.kind === "blocked" ? o.label.toLowerCase() : o.label));
  const openItem = card.open && items.find((i) => i.key === card.open!.key && i.meeting.days.includes(card.open!.day));

  const summary = (
    <p className="vbg-meta" aria-live="polite">
      {plan.sections.length} classes this week
      {conflicts > 0 ? (
        <span data-state="error">
          {" "}
          · {conflicts} {conflicts === 1 ? "class overlaps" : "classes overlap"} another commitment
        </span>
      ) : (
        " · no conflicts"
      )}
    </p>
  );

  if (props.primaryView === "agenda") {
    return (
      <div className="vbg-custom-stack-4">
        {summary}
        <ol className="vbg-custom-agenda">
          {DAYS.map((day) => (
            <li key={day}>
              <h3 className="vbg-heading-16">{DAY_NAMES[day]}</h3>
              <ul>
                {perDay(day).map((item) => (
                  <motion.li
                    layout="position"
                    layoutId={`${item.key}-${day}`}
                    key={item.key}
                    data-kind={item.kind}
                    data-state={item.conflict ? "error" : undefined}
                  >
                    <span className="vbg-custom-agenda-time">
                      {fmtTime(item.meeting.start)}–{fmtTime(item.meeting.end)}
                    </span>
                    <span>
                      <strong>{item.label}</strong> {item.detail}
                      {item.conflict && <span className="vbg-custom-note">Conflict</span>}
                    </span>
                  </motion.li>
                ))}
                {perDay(day).length === 0 && <li className="vbg-meta">Free</li>}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const pct = (m: number) => ((m - START) / (END - START)) * 100;
  return (
    <div className="vbg-custom-stack-4">
      {summary}
      <div ref={weekRef} className="vbg-custom-week" role="table" aria-label="Weekly schedule">
        <div className="vbg-custom-week-axis" aria-hidden>
          {HOURS.map((h) => (
            <span key={h} style={{ top: `${pct(h)}%` }}>
              {shortTime(h)}
            </span>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="vbg-custom-week-day" role="row">
            <div className="vbg-custom-week-head" role="columnheader">
              {DAY_NAMES[day].slice(0, 3)}
            </div>
            <div className="vbg-custom-week-body">
              {HOURS.map((h) => (
                <span key={h} className="vbg-custom-week-line" style={{ top: `${pct(h)}%` }} aria-hidden />
              ))}
              {/* Classes added or dropped elsewhere in the view settle into or out of the week.
                  Position only when switching to the agenda: a block reshaped into a row would stretch its text. */}
              <AnimatePresence initial={false}>
                {layoutDay(perDay(day)).map(({ item, col, span, cols }) => {
                  const { tap, ...hover } = card.bind(item.key, day);
                  return (
                    <motion.button
                      {...hover}
                      type="button"
                      layout="position"
                      layoutId={`${item.key}-${day}`}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1, transition: enter }}
                      exit={{ opacity: 0, scale: 0.96, transition: exit }}
                      key={item.key}
                      role="cell"
                      className="vbg-custom-week-item"
                      data-kind={item.kind}
                      data-state={item.conflict ? "error" : undefined}
                      data-size={item.meeting.end - item.meeting.start < SHORT ? "short" : undefined}
                      data-split={span < cols ? "" : undefined}
                      style={{
                        top: `${pct(item.meeting.start)}%`,
                        height: `${pct(item.meeting.end) - pct(item.meeting.start)}%`,
                        // Buttons shrink to their text even with left and right set, so the width is explicit.
                        left: `calc(${(col / cols) * 100}% + 3px)`,
                        width: `calc(${(span / cols) * 100}% - 6px)`,
                      }}
                      onClick={(e) => {
                        tap(e.currentTarget);
                        if (item.course) selectCourse(item.course);
                      }}
                      // Not `disabled`: blocked time still needs hover and focus to show its card.
                      aria-disabled={item.course ? undefined : true}
                      aria-label={`${item.label}, ${fmtTime(item.meeting.start)} to ${fmtTime(item.meeting.end)}${item.conflict ? ", conflict" : ""}`}
                      aria-describedby={card.isOpen(item.key, day) ? cardId : undefined}
                    >
                      <span className="vbg-custom-week-text">
                        <strong>
                          {item.label.split(" ").map((word, i) => (
                            <Fragment key={i}>
                              {i > 0 && " "}
                              <span className="vbg-custom-week-word">{word}</span>
                            </Fragment>
                          ))}
                        </strong>
                        <span>{shortTime(item.meeting.start)}</span>
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ))}
        <AnimatePresence>
          {openItem && card.open && (
            <motion.div
              ref={cardRef}
              key="card"
              id={cardId}
              role="tooltip"
              className="vbg-custom-week-card"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, transition: enter }}
              exit={{ opacity: 0, scale: 0.96, transition: exit }}
            >
              <p>
                <strong>{openItem.label}</strong>
                {openItem.title && ` ${openItem.title}`}
              </p>
              <p className="vbg-meta">
                {DAY_NAMES[card.open.day]} {fmtTime(openItem.meeting.start)}–{fmtTime(openItem.meeting.end)}
                {openItem.kind === "blocked" ? " · Blocked" : openItem.room && ` · ${openItem.room}`}
              </p>
              {clashesOn(openItem, card.open.day).map((c) => (
                <p key={c} className="vbg-meta" data-state="error">
                  Overlaps {c}
                </p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
