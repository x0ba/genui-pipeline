# Design rules

The app follows Vercel's design guidance, using the published `vercel-brand.css` foundation.

- Monochrome first. Colour only for meaning, always paired with text: set `data-state="error"` or `data-state="warning"` on an element to colour it; never colour to decorate. Every text colour must follow the Contrast section below.
- Typography is Geist. Use the published roles: `vbg-heading-16` for sub-headings, `vbg-meta` for secondary lines, `vbg-caption` for chart captions, `vbg-numeric` for right-aligned tabular numbers. Never set arbitrary font sizes or weights.
- Tables: semantic `<table>` inside `<div className="vbg-table-wrap">`, `<th scope>`, numeric headers and cells both get `className="vbg-numeric"`.
- Charts: `<figure className="vbg-chart">` with an inline `<svg>` and a `<figcaption className="vbg-caption">` stating what to notice. Direct labels beat legends. Series colours: `var(--vbg-chart-1)` … `var(--vbg-chart-6)`; neutral marks use `currentColor` or `var(--vbg-text-secondary)`; rules use `var(--vbg-border-default)`. SVG `<text>` inside `.vbg-chart` is coloured by the stylesheet (`var(--vbg-text-secondary)`, 12px); give it `className="vbg-meta"` and nothing else, or set its colour with `style={{ fill }}` (see Contrast). Give the SVG `role="img"` and an `aria-label`, or pair it with a visually hidden table (`className="vbg-visually-hidden"`).
- Spacing tokens: `var(--vbg-space-1)` … `var(--vbg-space-16)`. Radii: `var(--vbg-radius-small)`, `var(--vbg-radius)`. Surfaces: `var(--vbg-surface-primary)`, `var(--vbg-surface-secondary)`. Text: `var(--vbg-text-primary)`, `var(--vbg-text-secondary)`. Borders: `var(--vbg-border-subtle|default|strong)`.
- Layout helpers you may use: `vbg-custom-stack-2`, `vbg-custom-stack-4`, `vbg-custom-stack-6` (vertical rhythm), `vbg-custom-actions` (a row of buttons), `vbg-custom-text-button` (quiet text button), `vbg-button` (primary button), `vbg-custom-plain` (unstyled list). Inline `style` is fine for geometry.
- No gradients, glows, shadows, pills, badges, icon tiles, emoji or decorative borders. No cards inside cards. Both light and dark themes must work, so only use the tokens above, never raw hex colours.
- Motion: `motion.*` elements with `layout="position"` so state changes glide into place (plain `layout` also animates size by scaling, which stretches text). Do not set `transition` for layout: the shell supplies one spring for every moving piece. For things arriving or leaving inside `AnimatePresence`, use the kit's `enter` and `exit` transitions, start from `opacity: 0` with at most `y: 8` or `scale: 0.96` (never `scale: 0`), and spread `collapse` on rows that should open and close in place (the row element must have no padding or border of its own; put them on a child). Nothing animates in response to typing: pass `transition={instant}` for changes caused by a text input. Animate bars with `scaleX` and a left `transformOrigin` rather than `width` where you can. No decorative or looping animation.
- Must fit the slot's width (it may be a narrow side column or a phone). Give SVG a `viewBox`, `width="100%"` and `style={{ maxWidth: naturalWidth }}` so it shrinks to fit but never scales text above its natural size. Allow horizontal scroll only for wide tables or diagrams (`style={{ overflowX: "auto" }}`).

## Contrast

Every piece of text must reach WCAG AA contrast (4.5:1, or 3:1 at 24px and up) against whatever is painted behind it, in both themes. `write_component` enforces this. It renders the component in a real browser in light and dark themes, for every prop option, for every sample person who can see it, at desktop and phone widths, and after clicking its controls. It measures each piece of text against the pixels behind it, and it rejects text that fails, text drawn over other text, and text under 10px. Raw colour values (hex, `rgb()`, `oklch()`, named colours) are rejected outright.

The only safe text and background pairs are:

| Text | Background |
| --- | --- |
| `var(--vbg-text-primary)`, `var(--vbg-text-secondary)` | `var(--vbg-surface-primary)`, `var(--vbg-surface-secondary)`, `heat(0).fill` |
| `var(--vbg-text-on-contrast)` | `var(--vbg-surface-contrast)` |
| `heat(t).ink` | `heat(t).fill`, for the same `t` |

- A mark that carries a label (a heatmap cell, a filled bar segment, a node) is drawn with `heat(t)`: `fill={h.fill}` on the mark and the paired ink on its text. The ink flips from dark to light partway up the ramp, and differently in each theme, so never pick the text colour yourself with a threshold.
- Never put text on a series colour (`--vbg-chart-*`), a border token, or anything drawn with `opacity`, `fillOpacity` or a translucent colour. Translucent fills make contrast depend on what is underneath. To show intensity, step through `heat()`; do not fade a colour.
- Never use a surface token as a text colour. A text colour that equals its background's opposite in one theme is wrong in the other.
- SVG `<text>` inside `.vbg-chart` ignores the `fill` attribute, because the stylesheet sets its fill. Set colour with `style={{ fill: h.ink }}`. The audit rejects `fill` attributes on text that are silently overridden.

```tsx
const h = heat(count / max);
<g>
  <rect x={x} y={y} width={w} height={rowH} rx={2} fill={h.fill} />
  <text x={x + w / 2} y={y + rowH / 2 + 4} textAnchor="middle" className="vbg-meta" style={{ fill: h.ink }}>{count}</text>
</g>
// HTML: <td style={{ background: h.fill, color: h.ink }}>{count}</td>
```

Generated components also run inside a runtime guard that recolours any label that still falls below AA, but that guard is a last resort and logs a warning. Components are expected to pass on their own.
