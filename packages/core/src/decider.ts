// The decider is the fast model. It answers batches of multiple-choice
// questions and never generates anything. The library builds the questions and
// checks every answer, so whatever model sits behind an adapter, it cannot
// produce a screen the renderer cannot draw.

export type Prompt = string | { [key: string]: unknown };

export type Question =
  | { kind: "choice"; prompt: Prompt; options: Record<string, string> }
  | { kind: "binary"; prompt: Prompt; true: string; false: string }
  | { kind: "score"; prompt: Prompt; levels: string[] };

export type Answer =
  | { kind: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { kind: "binary"; probability: number }
  | { kind: "score"; score: number; confidence: number };

export type DeciderResult = {
  answers: Record<string, Answer>;
  usage: { inputTokens: number; costUsd: number };
  model: string;
};

export interface Decider {
  /** Shown in devtools. */
  readonly model?: string;
  ask(input: { state: Record<string, unknown>; questions: Record<string, Question> }): Promise<DeciderResult>;
}

export const choiceQ = (prompt: Prompt, options: Record<string, string>): Question => ({ kind: "choice", prompt, options });
export const binaryQ = (prompt: Prompt, criteria: { true: string; false: string }): Question => ({ kind: "binary", prompt, ...criteria });
export const scoreQ = (prompt: Prompt, levels: string[]): Question => ({ kind: "score", prompt, levels });

const finite = (n: unknown, fallback = 0) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);
const unit = (n: unknown) => Math.min(1, Math.max(0, finite(n)));

/**
 * Read every answer against its question. An answer that is missing, of the
 * wrong kind or not one of the listed options is replaced: a choice with
 * `fallbacks[id]` (or its first option), a probability with 0, a score with 0.
 * Each replacement is described in `invalid`.
 */
export function checkAnswers(
  questions: Record<string, Question>,
  answers: Record<string, Answer | undefined>,
  fallbacks: Record<string, string> = {},
): { answers: Record<string, Answer>; invalid: string[] } {
  const out: Record<string, Answer> = {};
  const invalid: string[] = [];
  for (const [id, q] of Object.entries(questions)) {
    const a = answers[id];
    if (q.kind === "choice") {
      const keys = Object.keys(q.options);
      if (a?.kind === "choice" && keys.includes(a.choice)) {
        const probabilities = Object.fromEntries(keys.map((k) => [k, unit(a.probabilities?.[k])]));
        out[id] = { kind: "choice", choice: a.choice, confidence: unit(a.confidence), probabilities };
      } else {
        const fallback = fallbacks[id] && keys.includes(fallbacks[id]) ? fallbacks[id] : keys[0]!;
        invalid.push(`${id}: ${a?.kind === "choice" ? `'${a.choice}' is not one of the options` : "no choice answer"}; used '${fallback}'`);
        out[id] = { kind: "choice", choice: fallback, confidence: 0, probabilities: Object.fromEntries(keys.map((k) => [k, k === fallback ? 1 : 0])) };
      }
    } else if (q.kind === "binary") {
      if (a?.kind === "binary" && Number.isFinite(a.probability) && a.probability >= 0 && a.probability <= 1) out[id] = a;
      else {
        invalid.push(`${id}: no valid probability; used 0`);
        out[id] = { kind: "binary", probability: 0 };
      }
    } else {
      const max = q.levels.length - 1;
      if (a?.kind === "score" && Number.isFinite(a.score) && a.score >= 0 && a.score <= max) out[id] = { ...a, confidence: unit(a.confidence) };
      else {
        invalid.push(`${id}: no valid score; used 0`);
        out[id] = { kind: "score", score: 0, confidence: 0 };
      }
    }
  }
  return { answers: out, invalid };
}
