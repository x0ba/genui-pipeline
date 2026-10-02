import { HOST_GLOBAL, type ComponentDef, type MalleableEvent, type ModuleHost } from "@malleable/core";
import * as React from "react";
import { createContext, lazy, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import * as JsxRuntime from "react/jsx-runtime";
import { createClient, type MalleableClient } from "./client";
import type { Implementation } from "./implement";
import { createRegionStore, type RegionStore } from "./store";

export type SlotComponent = ComponentType<Record<string, unknown>>;

const EVENT_LIMIT = 2000;

/** The person's event stream, shared by every region store and devtools. */
function eventHub(stores: () => Iterable<RegionStore>) {
  let events: MalleableEvent[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    get: () => events,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    push(batch: MalleableEvent[], replay: boolean) {
      const seen = new Set(events.map((e) => e.id));
      const fresh = batch.filter((e) => !seen.has(e.id));
      if (!fresh.length) return;
      events = [...events, ...fresh].slice(-EVENT_LIMIT);
      for (const e of fresh) for (const s of stores()) s.onEvent(e, replay);
      notify();
    },
    clear() {
      events = [];
      notify();
    },
  };
}

type MalleableContextValue = {
  client: MalleableClient;
  /** The store for one region, created on first use. */
  store(name: string): RegionStore;
  /** Regions with a store so far. */
  regions(): string[];
  builtin(id: string): SlotComponent | null;
  /** The compiled module of a generated component, imported on first use and cached by its hash. */
  generated(def: ComponentDef): SlotComponent | null;
  events: ReturnType<typeof eventHub>;
};

const MalleableContext = createContext<MalleableContextValue | null>(null);

export function useMalleable() {
  const value = useContext(MalleableContext);
  if (!value) throw new Error("wrap the app in <MalleableProvider>");
  return value;
}

/**
 * Compiled components import `react` and the kit through this lookup, so they
 * share the host's React instance whichever bundler built the host.
 */
function installHost(modules: Record<string, unknown>) {
  const all: Record<string, unknown> = { react: React, "react/jsx-runtime": JsxRuntime, ...modules };
  const host: ModuleHost = {
    require(specifier) {
      if (!(specifier in all)) throw new Error(`a generated component imported '${specifier}', which the host does not provide`);
      return all[specifier];
    },
  };
  (globalThis as Record<string, unknown>)[HOST_GLOBAL] = host;
}

export type MalleableProviderProps = {
  /** Where @malleable/server's handler is mounted. Default `/api/malleable`. */
  endpoint?: string;
  /** Implementations of the builtin components: `implement(definition, Component)`. */
  components: Implementation[];
  /** What generated components may import besides react, by specifier: `{ "@kit": kit, "motion/react": motion }`. */
  modules?: Record<string, unknown>;
  /** Context keys, such as `{ device: "phone" }`. The server supplies what each means. */
  context?: Record<string, string>;
  headers?: Record<string, string>;
  children: ReactNode;
};

export function MalleableProvider({ endpoint = "/api/malleable", components, modules = {}, context = {}, headers, children }: MalleableProviderProps) {
  installHost(modules);
  const contextRef = useRef(context);
  contextRef.current = context;
  const headerKey = JSON.stringify(headers ?? {});

  // Components and headers are read once per endpoint, like a router's route table.
  const value = useMemo<MalleableContextValue>(() => {
    const client = createClient({ endpoint, ...(headers ? { headers } : {}) });
    const stores = new Map<string, RegionStore>();
    const builtins = new Map(components.map((c) => [c.def.id, c.Component as SlotComponent]));
    const loaded = new Map<string, SlotComponent>();
    const events = eventHub(() => stores.values());
    return {
      client,
      events,
      store(name) {
        let s = stores.get(name);
        if (!s) {
          s = createRegionStore(name, { client, context: () => contextRef.current });
          stores.set(name, s);
          for (const e of events.get()) s.onEvent(e, true);
        }
        return s;
      },
      regions: () => [...stores.keys()],
      builtin: (id) => builtins.get(id) ?? null,
      generated(def) {
        const hash = def.artifact?.hash;
        if (!hash) return null;
        let c = loaded.get(hash);
        if (!c) {
          const url = client.componentUrl(def.id, hash);
          c = lazy(() => import(/* @vite-ignore */ /* webpackIgnore: true */ url));
          loaded.set(hash, c);
        }
        return c;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, headerKey]);

  // One event stream per provider. Events replayed on connect, before the
  // server's `ready`, update run state but trigger no reloads.
  useEffect(() => {
    const source = new EventSource(value.client.eventsUrl(), { withCredentials: true });
    let ready = false;
    let buffer: MalleableEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const batch = buffer;
      buffer = [];
      value.events.push(batch, !ready);
    };
    source.addEventListener("open", () => {
      ready = false;
      value.events.clear();
    });
    source.addEventListener("ready", () => {
      flush();
      ready = true;
    });
    source.onmessage = (m) => {
      buffer.push(JSON.parse(m.data) as MalleableEvent);
      if (ready) frame ||= requestAnimationFrame(flush);
    };
    return () => {
      cancelAnimationFrame(frame);
      source.close();
    };
  }, [value]);

  // A context change re-serves every region in the new context.
  const contextKey = JSON.stringify(context);
  const lastContext = useRef(contextKey);
  useEffect(() => {
    if (lastContext.current === contextKey) return;
    lastContext.current = contextKey;
    for (const name of value.regions()) value.store(name).contextChanged();
  }, [contextKey, value]);

  return <MalleableContext.Provider value={value}>{children}</MalleableContext.Provider>;
}

/** The person's pipeline events. */
export function useEvents() {
  const { events } = useMalleable();
  return useSyncExternalStore(events.subscribe, events.get, events.get);
}
