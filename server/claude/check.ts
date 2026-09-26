import { readFileSync } from "node:fs";
import type { ComponentDef, Subject } from "../../shared/spec";
import { renderForCheck } from "../../web/src/kit/harness";

const ALLOWED_IMPORTS = new Set(["react", "motion/react", "@kit"]);

/**
 * Validate a generated component the way it will run: import it, then
 * server-render it with the user's data once per prop option. A component that
 * throws, renders nothing, or reaches outside the kit never gets installed.
 */
export async function checkComponent(path: string, def: ComponentDef, subject: Subject): Promise<string[]> {
  const source = readFileSync(path, "utf8");
  const errors: string[] = [];

  const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of imports)
    if (!ALLOWED_IMPORTS.has(spec)) errors.push(`import of '${spec}' is not allowed; use only react, motion/react and @kit`);
  if (/\b(fetch|XMLHttpRequest|localStorage|document\.cookie|eval)\b/.test(source))
    errors.push("components may not use network, storage, cookies or eval");
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

  for (const props of variants) {
    try {
      const html = renderForCheck(Component as never, props, subject);
      if (html.replace(/<[^>]+>/g, "").trim().length < 10)
        errors.push(`rendered no visible text with props ${JSON.stringify(props)}; include labels or a text alternative`);
    } catch (e) {
      errors.push(`threw while rendering with props ${JSON.stringify(props)}: ${(e as Error).message}`);
    }
  }
  return errors;
}
