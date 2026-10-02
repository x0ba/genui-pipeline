import { heat, HEAT_STEPS } from "@kit";

// Every step of the heat() ramp with a label on it, in SVG and HTML, so
// scripts/check-contrast.ts proves each fill and ink pair in both themes.
export default function HeatRamp(props: Record<string, string>) {
  const steps = Array.from({ length: HEAT_STEPS + 1 }, (_, i) => heat(i / HEAT_STEPS));
  return (
    <figure className="vbg-chart vbg-custom-stack-4">
      <svg viewBox={`0 0 ${steps.length * 64} 32`} width="100%" style={{ maxWidth: steps.length * 64 }} role="img" aria-label="Heat ramp">
        {steps.map((h, i) => (
          <g key={i}>
            <rect x={i * 64 + 1} y={1} width={62} height={30} rx={2} fill={h.fill} />
            <text x={i * 64 + 32} y={20} textAnchor="middle" className="vbg-meta" style={{ fill: h.ink }}>
              {props.label === "long" ? `step ${h.step}` : h.step}
            </text>
          </g>
        ))}
      </svg>
      <table>
        <tbody>
          <tr>
            {steps.map((h, i) => (
              <td key={i} style={{ background: h.fill, color: h.ink }}>{`step ${h.step}`}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </figure>
  );
}
