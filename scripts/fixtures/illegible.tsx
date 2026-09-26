import { useState } from "react";

// Deliberately illegible components, one per `case`, that scripts/check-contrast.ts
// expects the audit to reject. They cover the ways generated code has gone wrong.
export default function Illegible({ props }: { props: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const chart = (children: React.ReactNode, width = 480) => (
    <figure className="vbg-chart">
      <svg viewBox={`0 0 ${width} 40`} width="100%" role="img" aria-label="fixture">
        {children}
      </svg>
    </figure>
  );
  switch (props.case) {
    // Faded series colour with the stylesheet's default text colour on top: the original heatmap.
    case "translucent":
      return chart(
        <g>
          <rect x={0} y={0} width={120} height={40} fill="var(--vbg-chart-1)" fillOpacity={0.8} />
          <text x={60} y={25} textAnchor="middle" className="vbg-meta">18 advisees</text>
        </g>,
      );
    // The flip the original heatmap attempted, which the stylesheet silently discards.
    case "ignored-fill":
      return chart(
        <g>
          <rect x={0} y={0} width={120} height={40} fill="var(--vbg-surface-contrast)" />
          <text x={60} y={25} textAnchor="middle" fill="var(--vbg-text-on-contrast)" className="vbg-meta">23 advisees</text>
        </g>,
      );
    case "surface-ink":
      return <p style={{ background: "var(--vbg-surface-secondary)", color: "var(--vbg-surface-primary)" }}>Surface colour used as text</p>;
    case "wrong-pair":
      return <p style={{ background: "var(--vbg-surface-contrast)", color: "var(--vbg-text-secondary)" }}>Secondary text on the contrast surface</p>;
    // Passes in light, fails in dark.
    case "dark-only":
      return <p style={{ color: "var(--vbg-surface-contrast)" }}>Fixed dark text that vanishes in dark mode</p>;
    case "overlap":
      return chart(
        <g>
          <text x={10} y={25} className="vbg-meta">CS 220 Data Structures</text>
          <text x={30} y={27} className="vbg-meta">CS 230 Systems</text>
        </g>,
      );
    // A huge viewBox scales 12px text down to a few pixels.
    case "tiny":
      return chart(<text x={10} y={25} className="vbg-meta">Scaled-down label</text>, 2400);
    // Legible until the control is used.
    case "after-click":
      return (
        <div className="vbg-custom-stack-2">
          <button type="button" className="vbg-button" onClick={() => setOpen(true)}>Show detail</button>
          {open && <p style={{ background: "var(--vbg-chart-1)", color: "var(--vbg-text-secondary)", opacity: 0.9 }}>Detail on a series colour</p>}
        </div>
      );
    default:
      return <p>Unknown case</p>;
  }
}
