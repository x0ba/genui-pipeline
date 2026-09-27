import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";
import { indicator } from "./kit";

type Option<T extends string> = { id: T; label: string };

export function Segmented<T extends string>(props: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "default" | "compact";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { options, value, onChange } = props;
  const layoutId = useId();

  // Radio-group keyboard model: arrows move and select, Tab leaves the group.
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={props.label} className="vbg-custom-segmented" data-size={props.size ?? "default"}>
      {options.map((o, i) => {
        const checked = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {checked && <motion.span layoutId={layoutId} className="vbg-custom-segmented-thumb" transition={indicator} />}
            <span className="vbg-custom-segmented-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
