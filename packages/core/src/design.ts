// The app's design contract: stylesheets, themes, colour tokens, the text and
// background pairs that are safe, and its design rules. The static checks, the
// legibility audit, the runtime contrast guard and the builder all read it.

export type Theme = {
  /** An attribute set on the frame's theme root, such as ["data-theme", "dark"]. */
  attribute?: [string, string];
  /** A prefers-color-scheme value to emulate. */
  colorScheme?: "light" | "dark";
};

export type SafePair = { text: string[]; background: string[] };

export type DesignContract = {
  /** URLs, or file paths on the server, in the order the app loads them. */
  stylesheets: string[];
  themes: Record<string, Theme>;
  /** Custom properties (without var()) that are safe as text colours on plain surfaces. */
  textColors: string[];
  safePairs: SafePair[];
  /** The design rules the builder reads. */
  rules: string;
  /**
   * HTML a component is rendered inside during verification, so app-level
   * selectors apply. Mark the theme root with `data-malleable-root` and the
   * mount point with `data-malleable-mount`.
   */
  frame?: string;
  /** Extra advice appended to contrast findings, such as the app's own colour helpers. */
  contrastAdvice?: string;
};

export const defineDesign = (design: DesignContract) => design;

/** What the browser needs from the design contract for the runtime guard. */
export type DesignInks = { textColors: string[]; safePairs: SafePair[] };

export const cssVar = (token: string) => (token.startsWith("var(") ? token : `var(${token})`);

/** The colours the runtime guard may recolour text with: the main text colour and the main surface, so one reads in each theme. */
export const guardInks = (d: DesignInks) =>
  [...new Set([...d.textColors.slice(0, 1), ...(d.safePairs[0]?.background.slice(0, 1) ?? [])])].map(cssVar);

/** The safe pairs as a sentence, for findings and the builder. */
export function describeSafePairs(design: Pick<DesignContract, "safePairs">) {
  return design.safePairs.map((p) => `${p.text.map(cssVar).join(" or ")} on ${p.background.map(cssVar).join(" or ")}`).join("; ");
}
