import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Suspense, useEffect, useRef, type ReactNode, type Ref } from "react";
import { resolveProps, type ComponentDef, type Decision, type Layout, type Slot, type Spec } from "../../../shared/spec";
import { easeOut, enter, exit } from "../kit";
import { watchContrast } from "./contrast";
import { componentFor, SlotBoundary } from "./registry";

type Props = {
  spec: Spec;
  library: Record<string, ComponentDef>;
  viewId: string;
  decision: Decision | null;
  showDecisions: boolean;
  /** Slots that are new since the previous spec version, marked briefly. */
  fresh: Set<string>;
};

export function Renderer({ spec, library, viewId, decision, showDecisions, fresh }: Props) {
  const view = spec.views.find((v) => v.id === viewId) ?? spec.views.find((v) => v.id === spec.home) ?? spec.views[0];
  const current = decision && decision.view === view.id ? decision : null;
  const layout: Layout = current?.layout ?? view.layout;
  const regions = (["top", "main", "aside"] as const).map((r) => [r, view.slots.filter((s) => s.region === r)] as const);
  let order = 0;

  return (
    // Only the slots animate. The view and regions are invisible boxes, and
    // animating their size would scale, and so distort, everything inside them.
    <LayoutGroup id="spec">
      <div className="vbg-custom-view" data-layout={layout}>
        {/* Regions stay mounted even when empty, so their last slots can fade out too. */}
        {regions.map(([region, slots]) => (
          <div key={region} className="vbg-custom-region" data-region={region}>
            {/* Slots cascade in when a person's first view arrives, then only the pieces that change animate. */}
            <AnimatePresence mode="popLayout">
              {slots.map((slot) => (
                <SlotFrame
                  key={slot.component}
                  order={order++}
                  slot={slot}
                  def={library[slot.component]}
                  chosen={current?.props[slot.id] ?? {}}
                  confidence={current?.propConfidence[slot.id] ?? {}}
                  showDecisions={showDecisions}
                  fresh={fresh.has(`${view.id}/${slot.id}`)}
                />
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </LayoutGroup>
  );
}

function SlotFrame(p: {
  /** AnimatePresence's popLayout measures the leaving slot through this ref. */
  ref?: Ref<HTMLElement>;
  /** Reading order in the view, for the entrance cascade. */
  order: number;
  slot: Slot;
  def: ComponentDef | undefined;
  chosen: Record<string, string>;
  confidence: Record<string, number>;
  showDecisions: boolean;
  fresh: boolean;
}) {
  const { slot, def } = p;
  if (!def) return <p data-state="error">Unknown component {slot.component}</p>;
  const Component = componentFor(def);
  const props = resolveProps(def, slot, p.chosen);
  const bare = def.id === "deadline-banner" || def.id === "stat-strip";

  return (
    // Slots glide to their new place but take their new size at once: scaling a
    // slot to animate its size would stretch its text. New slots cascade in.
    <motion.section
      ref={p.ref}
      layout="position"
      layoutId={def.id}
      className="vbg-custom-slot"
      data-fresh={p.fresh || undefined}
      data-bare={bare || undefined}
      aria-label={def.title}
      initial={{ opacity: 0, y: 8 }}
      // Wait for the outgoing slot's fade to mostly clear before arriving, so two views never overlap.
      animate={{ opacity: 1, y: 0, transition: { ...enter, delay: 0.08 + Math.min(p.order, 4) * 0.04 } }}
      exit={{ opacity: 0, transition: exit }}
    >
      {(!bare || p.showDecisions) && (
        <header className="vbg-custom-slot-head">
          {!bare && <h2 className="vbg-heading-20">{def.title}</h2>}
          {p.showDecisions && (
            <p className="vbg-custom-variant">
              {Object.entries(def.props).map(([key, prop]) => {
                const adaptive = slot.adaptive.includes(key);
                const fixed = key in slot.props;
                return (
                  <span key={key} data-source={adaptive ? "jev" : fixed ? "spec" : "default"}>
                    <span className="vbg-custom-variant-key">{prop.label}</span>{" "}
                    <motion.span key={props[key]} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: easeOut }}>
                      {props[key]}
                    </motion.span>
                    <span className="vbg-custom-variant-src">
                      {adaptive
                        ? p.confidence[key] !== undefined
                          ? ` Jev ${Math.round(p.confidence[key] * 100)}%`
                          : " Jev"
                        : fixed
                          ? " spec"
                          : " default"}
                    </span>
                  </span>
                );
              })}
              {def.source === "generated" && <span data-source="generated">Generated by Claude</span>}
            </p>
          )}
        </header>
      )}
      <SlotBoundary name={def.title}>
        <Suspense fallback={<p className="vbg-meta">Loading {def.title}…</p>}>
          {!Component ? (
            <p data-state="error">No implementation for {def.id}</p>
          ) : def.source === "generated" ? (
            <ContrastGuard name={def.id}>
              <Component props={props} />
            </ContrastGuard>
          ) : (
            <Component props={props} />
          )}
        </Suspense>
      </SlotBoundary>
    </motion.section>
  );
}

/** Generated code passed the install audit, but data, themes and states change at runtime. */
function ContrastGuard({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => watchContrast(ref.current!, name), [name]);
  return (
    <div ref={ref} className="vbg-custom-guard">
      {children}
    </div>
  );
}
