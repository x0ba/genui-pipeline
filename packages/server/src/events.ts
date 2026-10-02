import type { MalleableEvent, MalleableEventInput } from "@malleable/core";

type Listener = (event: MalleableEvent) => void;

/** The event stream. Each person only ever receives their own events. */
export function eventBus(limit = 2000) {
  const history: MalleableEvent[] = [];
  const listeners = new Set<Listener>();
  let seq = 0;
  return {
    emit(input: MalleableEventInput): MalleableEvent {
      const event = { ...input, id: `e${++seq}`, at: new Date().toISOString() } as MalleableEvent;
      history.push(event);
      if (history.length > limit) history.splice(0, history.length - limit);
      for (const l of listeners) l(event);
      return event;
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    recent(userId: string) {
      return history.filter((e) => e.userId === userId);
    },
    clear(userId: string) {
      for (let i = history.length - 1; i >= 0; i--) if (history[i]!.userId === userId) history.splice(i, 1);
    },
  };
}

export type EventBus = ReturnType<typeof eventBus>;
