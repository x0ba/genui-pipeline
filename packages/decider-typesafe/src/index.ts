import type { Answer, Decider, Question } from "@malleable/core";
import { choice, noul, score, TypeSafeClient, type EntryType, type Questions, type ScoreCriteria } from "@typesafe-ai/sdk";

// The decider adapter for Jev, TypeSafe's System One model: every question
// becomes a Choice, Noul or Score question, answered in one call.

export type TypesafeDeciderOptions = {
  /** Default: `TYPESAFE_DEFAULT_MODEL`, then `jev-latest`. */
  model?: string;
  /** Default: `TYPESAFE_API_KEY`. */
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  /** For the cost shown in devtools. Default: $0.042 per million input tokens. */
  usdPerInputToken?: number;
};

const toEntry = (prompt: Question["prompt"]) => prompt as EntryType;

function toTypesafe(questions: Record<string, Question>): Questions {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [
      id,
      q.kind === "choice"
        ? choice(toEntry(q.prompt), q.options)
        : q.kind === "binary"
          ? noul(toEntry(q.prompt), { true: q.true, false: q.false })
          : score(toEntry(q.prompt), q.levels as unknown as ScoreCriteria),
    ]),
  );
}

type RawAnswer = { type: string; choice?: string; confidence?: number; probabilities?: Record<string, number>; noul?: number; score?: number };

function fromTypesafe(raw: RawAnswer | undefined): Answer | undefined {
  if (!raw) return undefined;
  if (raw.type === "choice") return { kind: "choice", choice: String(raw.choice), confidence: raw.confidence ?? 0, probabilities: raw.probabilities ?? {} };
  if (raw.type === "noul") return { kind: "binary", probability: raw.noul ?? Number.NaN };
  if (raw.type === "score") return { kind: "score", score: raw.score ?? Number.NaN, confidence: raw.confidence ?? 0 };
  return undefined;
}

export function typesafeDecider(options: TypesafeDeciderOptions = {}): Decider {
  const model = options.model ?? process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";
  const usdPerInputToken = options.usdPerInputToken ?? 0.042 / 1_000_000;
  let client: TypeSafeClient | null = null;
  const jev = () => {
    const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
    client ??= new TypeSafeClient({ apiKey, defaultModel: model, timeout: options.timeoutMs ?? 15_000, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
    return client;
  };

  return {
    model,
    async ask({ state, questions }) {
      const result = await jev().systemOne({ state: state as EntryType, questions: toTypesafe(questions) });
      const raw = result.answers as unknown as Record<string, RawAnswer>;
      return {
        // The library checks every answer against its question; this only translates shapes.
        answers: Object.fromEntries(Object.keys(questions).flatMap((id) => {
          const a = fromTypesafe(raw[id]);
          return a ? [[id, a]] : [];
        })),
        usage: { inputTokens: result.usage.input_tokens, costUsd: result.usage.input_tokens * usdPerInputToken },
        model: result.model,
      };
    },
  };
}
