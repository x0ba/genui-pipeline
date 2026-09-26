import type { PipelineEvent, PipelineEventInput } from "../shared/events";

type Listener = (event: PipelineEvent) => void;

const history: PipelineEvent[] = [];
const listeners = new Set<Listener>();
let seq = 0;

export function emit(input: PipelineEventInput): PipelineEvent {
  const event = { ...input, id: `e${++seq}`, at: new Date().toISOString() } as PipelineEvent;
  history.push(event);
  if (history.length > 2000) history.splice(0, history.length - 2000);
  for (const l of listeners) l(event);
  return event;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recent(userId?: string) {
  return userId ? history.filter((e) => e.userId === userId) : [...history];
}

export function clearHistory(userId?: string) {
  if (!userId) history.length = 0;
  else for (let i = history.length - 1; i >= 0; i--) if (history[i].userId === userId) history.splice(i, 1);
}
