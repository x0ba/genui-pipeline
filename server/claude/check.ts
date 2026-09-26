import { readFileSync } from "node:fs";
import type { ComponentDef, Subject } from "../../shared/spec";
import { renderForCheck } from "../../web/src/kit/harness";
import { auditLegibility, subjectsFor } from "./contrast";

const ALLOWED_IMPORTS = new Set(["react", "motion/react", "@kit"]);

const RAW_COLOUR = [
  /["'`]#[0-9a-f]{3,8}["'`]/i,
  /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\(/i,
  /\b(?:fill|stroke|color|background|backgroundColor|borderColor|stopColor)\s*[:=]\s*\{?\s*["'`](?:white|black|gr[ae]y|silver|red|green|blue|orange|yellow)["'`]/i,
];

/**
 * Validate a generated component the way it will run: import it, server-render
 * it with the user's data once per prop option, then render it in a real
 * browser and measure its text. A component that throws, renders nothing,
 * reaches outside the kit or draws illegible text never gets installed.
 */
export async function checkComponent(path: string, def: ComponentDef, subject: Subject): Promise<string[]> {
  const source = readFileSync(path, "utf8");
  const errors: string[] = [];

  const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of imports)
    if (!ALLOWED_IMPORTS.has(spec)) errors.push(`import of '${spec}' is not allowed; use only react, motion/react and @kit`);
  if (/\b(fetch|XMLHttpRequest|localStorage|document\.cookie|eval)\b/.test(source))
    errors.push("components may not use network, storage, cookies or eval");
  for (const pattern of RAW_COLOUR) {
    const hit = source.match(pattern);
    if (hit)
      errors.push(`raw colour '${hit[0]}': use only the colour tokens and heat() from the kit reference, which are checked for contrast in both themes`);
  }
  if (errors.length) return errors;

  let Component: unknown;
  try {
    Component = (await import(path)).default;
  } catch (e) {
    return [`module failed to load: ${(e as Error).message}`];
  }
  if (typeof Component !== "function") return ["the module must `export default` a React function component"];

  const defaults = Object.fromEntries(Object.entries(def.props).map(([k, p]) => [k, p.default]));
  const variants: Record<string, string>[] = [defaults];
  for (const [key, prop] of Object.entries(def.props))
    for (const option of Object.keys(prop.options)) if (option !== prop.default) variants.push({ ...defaults, [key]: option });

  for (const who of subjectsFor(def, subject))
    for (const props of variants) {
      const context = `with props ${JSON.stringify(props)} for ${who.kind} ${who.id}`;
      try {
        const html = renderForCheck(Component as never, props, who);
        if (html.replace(/<[^>]+>/g, "").trim().length < 10)
          errors.push(`rendered no visible text ${context}; include labels or a text alternative`);
      } catch (e) {
        errors.push(`threw while rendering ${context}: ${(e as Error).message}`);
      }
    }
  if (errors.length) return errors;

  return auditLegibility(path, def, subject);
}
