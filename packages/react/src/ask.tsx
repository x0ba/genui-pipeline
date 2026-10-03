import { useId, useState, type FormEvent } from "react";
import { useRegion } from "./region";

export type AskBarProps = {
  region: string;
  placeholder?: string;
  label?: string;
  /** Requests offered as one-click chips. */
  suggestions?: string[];
  /** Controlled text, for apps that fill the bar from elsewhere. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
};

/** A text input that sends requests to one region. Apps can build their own with `useRegion`. */
export function AskBar({ region, placeholder = "Ask for what you need", label = "Ask for what you need", suggestions = [], value, onValueChange, className }: AskBarProps) {
  const r = useRegion(region);
  const [own, setOwn] = useState("");
  const text = value ?? own;
  const setText = (v: string) => (onValueChange ? onValueChange(v) : setOwn(v));
  const id = useId();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void r.request(text, { ask: true });
  };
  return (
    <div className={className} data-malleable-ask>
      <form onSubmit={onSubmit}>
        <label htmlFor={id} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
          {label}
        </label>
        <input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoComplete="off" />
        <button type="submit" disabled={r.serving === "ask"}>
          {r.serving === "ask" ? "Serving…" : "Ask"}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div role="group" aria-label="Suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s);
                void r.request(s, { ask: true });
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
