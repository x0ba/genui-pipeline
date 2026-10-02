import { guardInks, resolveKeys, resolveValues, type ComponentDef, type DesignInks, type RegionInfo, type Slot, type View } from "@malleable/core";
import { watchContrast } from "@malleable/core/contrast";
import {
  Component,
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
  type Ref,
} from "react";
import { useMalleable } from "./provider";
import type { RegionSnapshot } from "./store";

// ---------------------------------------------------------------- hooks

/** A region's state and what a person can do with it. */
export function useRegion(name: string) {
  const { store: storeFor } = useMalleable();
  const store = storeFor(name);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    ...state,
    history: state.data?.history ?? [],
    request: store.request,
    open: store.open,
    requestChange: store.requestChange,
    build: store.build,
    personalize: store.personalize,
    reset: store.reset,
    loadVersion: store.loadVersion,
    dismissGap: store.dismissGap,
    dismissError: store.dismissError,
  };
}

type SlotContextValue = { region: string; view: string; slot: string; requestChange(text: string): Promise<void> };
const SlotContext = createContext<SlotContextValue | null>(null);

/** Inside a slot: ask for a change to this one component, such as "make this denser". */
export function useSlot() {
  const value = useContext(SlotContext);
  if (!value) throw new Error("useSlot() is only available inside a slot rendered by <Region>");
  return value;
}

// ---------------------------------------------------------------- slot wrappers

export class SlotBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`slot ${this.props.name} failed`, error, info.componentStack);
  }
  override render() {
    if (this.state.error)
      return (
        <p data-state="error">
          {this.props.name} could not render: {this.state.error.message}
        </p>
      );
    return this.props.children;
  }
}

/** Generated code passed the install audit, but data, themes and states change at runtime. */
export function ContrastGuard({ name, design, children }: { name: string; design: DesignInks; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => watchContrast(ref.current!, name, guardInks(design)), [name, design]);
  return (
    <div ref={ref} data-malleable-guard style={{ display: "contents" }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- frames

/** Where each prop's value came from, for showing decisions. */
export type PropSource = "decider" | "spec" | "default";

export type SlotFrameProps = {
  /** Forward this to the frame's root element; animation libraries measure through it. */
  ref?: Ref<HTMLElement>;
  slot: Slot;
  def: ComponentDef;
  view: View;
  /** Reading order in the view. */
  order: number;
  /** New since the previous spec version. */
  fresh: boolean;
  /** Option keys per prop. */
  keys: Record<string, string>;
  source: Record<string, PropSource>;
  /** The decider's confidence in each prop it chose. */
  confidence: Record<string, number>;
  children: ReactNode;
};

export type Frames = {
  /** Wraps the whole view. */
  view?: ComponentType<{ view: View; layout: string; children: ReactNode }>;
  /** Wraps the slots of one area, inside the area's element. */
  area?: ComponentType<{ area: RegionInfo["areas"][number]; children: ReactNode }>;
  /** Wraps one slot. The default is a <section> labelled with the component's title. */
  slot?: ComponentType<SlotFrameProps>;
};

function DefaultSlotFrame({ ref, def, children }: SlotFrameProps) {
  return (
    <section ref={ref as Ref<HTMLElement>} data-malleable-slot={def.id} aria-label={def.title}>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Region

export type RegionProps = {
  name: string;
  frames?: Frames;
  /** Leave layout to the app's CSS: no inline grid styles, only `--malleable-columns` and data attributes. */
  unstyled?: boolean;
  className?: string;
  /** Shown before the region's spec has loaded. */
  fallback?: ReactNode;
};

/** Renders a region's current view: its layout, its areas and their slots. */
export function Region({ name, frames = {}, unstyled = false, className, fallback = null }: RegionProps) {
  const state = useRegion(name);
  const { data, view } = state;
  if (!data || !view) return <>{fallback}</>;
  return <RegionView state={state} data={data} view={view} frames={frames} unstyled={unstyled} className={className} />;
}

function RegionView({
  state,
  data,
  view,
  frames,
  unstyled,
  className,
}: {
  state: ReturnType<typeof useRegion>;
  data: NonNullable<RegionSnapshot["data"]>;
  view: View;
  frames: Frames;
  unstyled: boolean;
  className: string | undefined;
}) {
  const decision = state.decision?.view === view.id ? state.decision : null;
  const layoutId = decision?.layout ?? view.layout;
  const layout = data.region.layouts.find((l) => l.id === layoutId) ?? data.region.layouts[0]!;
  const ViewFrame = frames.view;
  const AreaFrame = frames.area;
  let order = 0;

  const style = {
    "--malleable-columns": layout.columns,
    ...(unstyled ? {} : { display: "grid", gridTemplateColumns: "var(--malleable-columns)", alignItems: "start" }),
    ...(layout.template ? { gridTemplateAreas: layout.template } : {}),
  } as CSSProperties;

  const areas = data.region.areas.map((area) => {
    const slots = view.slots.filter((s) => s.area === area.name);
    const children = slots.map((slot) => (
      <SlotHost
        // Keyed by component, so a component that stays on screen across views keeps its state.
        key={slot.component}
        region={data.region.name}
        view={view}
        slot={slot}
        def={data.components[slot.component]}
        chosen={decision?.props[slot.id] ?? {}}
        confidence={decision?.propConfidence[slot.id] ?? {}}
        anyProp={decision?.slot === slot.id}
        order={order++}
        fresh={state.fresh.has(`${view.id}/${slot.id}`)}
        design={data.design}
        Frame={frames.slot ?? DefaultSlotFrame}
        requestChange={(text) => state.requestChange(slot.id, text)}
      />
    ));
    return (
      // Areas stay mounted even when empty, so their last slots can animate out.
      <div
        key={area.name}
        data-area={area.name}
        data-span={area.span || undefined}
        style={
          unstyled
            ? undefined
            : { minWidth: 0, ...(layout.template ? { gridArea: area.name } : area.span ? { gridColumn: "1 / -1" } : {}) }
        }
      >
        {AreaFrame ? <AreaFrame area={area}>{children}</AreaFrame> : children}
      </div>
    );
  });

  const grid = (
    <div className={className} data-malleable-region={data.region.name} data-view={view.id} data-layout={layout.id} style={style}>
      {areas}
    </div>
  );
  return ViewFrame ? (
    <ViewFrame view={view} layout={layout.id}>
      {grid}
    </ViewFrame>
  ) : (
    grid
  );
}

function SlotHost(p: {
  ref?: Ref<HTMLElement>;
  region: string;
  view: View;
  slot: Slot;
  def: ComponentDef | undefined;
  chosen: Record<string, string>;
  confidence: Record<string, number>;
  anyProp: boolean;
  order: number;
  fresh: boolean;
  design: DesignInks;
  Frame: ComponentType<SlotFrameProps>;
  requestChange(text: string): Promise<void>;
}) {
  const { builtin, generated } = useMalleable();
  const { slot, def, view } = p;
  const slotContext = useMemo<SlotContextValue>(
    () => ({ region: p.region, view: view.id, slot: slot.id, requestChange: p.requestChange }),
    // requestChange is a fresh closure each render but always targets this slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.region, view.id, slot.id],
  );
  if (!def) return <p data-state="error">Unknown component {slot.component}</p>;
  const keys = resolveKeys(def, slot, p.chosen, p.anyProp);
  const values = resolveValues(def, slot, keys);
  const source = Object.fromEntries(
    Object.keys(def.props).map((k): [string, PropSource] => [
      k,
      (p.anyProp || slot.adaptive.includes(k)) && k in p.chosen ? "decider" : k in slot.props ? "spec" : "default",
    ]),
  );
  const Impl = def.source === "builtin" ? builtin(def.id) : generated(def);
  const body = !Impl ? (
    <p data-state="error">No implementation for {def.id}</p>
  ) : def.source === "generated" ? (
    <ContrastGuard name={def.id} design={p.design}>
      <Impl {...values} />
    </ContrastGuard>
  ) : (
    <Impl {...values} />
  );
  return (
    <p.Frame ref={p.ref} slot={slot} def={def} view={view} order={p.order} fresh={p.fresh} keys={keys} source={source} confidence={p.confidence}>
      <SlotContext.Provider value={slotContext}>
        <SlotBoundary name={def.title}>
          <Suspense fallback={<p data-state="loading">Loading {def.title}…</p>}>{body}</Suspense>
        </SlotBoundary>
      </SlotContext.Provider>
    </p.Frame>
  );
}
