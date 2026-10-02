import type { ComponentDef, ParamOption, PropDefinition } from "./component";
import type { Slot } from "./spec";

/** Every option of one prop in one slot, with its description and the value the component receives. */
export function optionsOf(def: ComponentDef, slot: Pick<Slot, "options"> | null, key: string): Record<string, ParamOption> {
  const prop = def.props[key];
  if (!prop) return {};
  if (prop.kind === "choice") return Object.fromEntries(Object.entries(prop.options).map(([k, when]) => [k, { value: k, when }]));
  return { ...prop.options, ...(slot?.options?.[key] ?? {}) };
}

/** Option key -> description, as the decider sees one prop. */
export function criteriaOf(def: ComponentDef, slot: Pick<Slot, "options"> | null, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(optionsOf(def, slot, key)).map(([k, o]) => [k, o.when]));
}

/**
 * A slot's effective option keys: component default < fixed < chosen.
 * Chosen keys apply to adaptive props, or to every prop when `anyProp` is set,
 * as for a request about one slot.
 */
export function resolveKeys(
  def: ComponentDef,
  slot: Slot,
  chosen: Record<string, string> = {},
  anyProp = false,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, prop] of Object.entries(def.props)) out[key] = prop.default;
  for (const [key, value] of Object.entries(slot.props)) if (key in def.props) out[key] = value;
  for (const [key, value] of Object.entries(chosen)) if (key in def.props && (anyProp || slot.adaptive.includes(key))) out[key] = value;
  for (const [key, value] of Object.entries(out)) if (!(value in optionsOf(def, slot, key))) out[key] = def.props[key]!.default;
  return out;
}

/** The values the component receives for a set of option keys. */
export function resolveValues(def: ComponentDef, slot: Pick<Slot, "options"> | null, keys: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(def.props) as [string, PropDefinition][]) {
    const k = keys[key] ?? prop.default;
    out[key] = prop.kind === "choice" ? k : (optionsOf(def, slot, key)[k] ?? prop.options[prop.default])?.value;
  }
  return out;
}

/** The default variant, then one variant per other option of each prop: the render matrix. */
export function variantsOf(def: ComponentDef, slot: Pick<Slot, "options"> | null = null): Record<string, string>[] {
  const defaults = Object.fromEntries(Object.entries(def.props).map(([k, p]) => [k, p.default]));
  const out: Record<string, string>[] = [defaults];
  for (const key of Object.keys(def.props))
    for (const option of Object.keys(optionsOf(def, slot, key))) if (option !== defaults[key]) out.push({ ...defaults, [key]: option });
  return out;
}
