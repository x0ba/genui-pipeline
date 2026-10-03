import { z } from "zod";

// A component definition describes one component to the decider and the
// builder: what it shows, who can use it, and its props. Every prop is a closed
// set of options, and each option's description is the decider's prompt.

export const ID = /^[a-z][a-z0-9-]*$/;

/** A `param` option: the value the component receives, and when it is the right choice. */
export type ParamOption<V = unknown> = { value: V; when: string };

export type ChoiceProp<K extends string = string> = {
  kind: "choice";
  label: string;
  options: Record<K, string>;
  default: K;
  /** Catalog sub-dimension this prop realizes, when a catalog plugin is used. */
  catalog?: string;
};

export type ParamProp<K extends string = string, V = unknown> = {
  kind: "param";
  label: string;
  /** A zod schema in code, or its JSON Schema once stored or sent to the client. */
  schema: z.ZodType<V> | JsonSchema;
  options: Record<K, ParamOption<V>>;
  default: K;
  catalog?: string;
};

export type PropDefinition = ChoiceProp | ParamProp;
export type JsonSchema = { [key: string]: unknown };

export type Origin = { request: string; userId: string; createdAt: string; runId: string };

/** The serializable form of a definition: what is stored, sent to the client and shown to models. */
export type ComponentDef = {
  id: string;
  version: number;
  title: string;
  description: string;
  /** Audiences whose data the component can show. Absent means every audience. */
  audiences?: string[];
  catalog?: string;
  source: "builtin" | "generated";
  props: Record<string, PropDefinition>;
  /** Generated only. Private components are usable only in their owner's spec until promoted. */
  scope?: "private" | "shared";
  /** Generated only. Content hash of the compiled module. */
  artifact?: { hash: string };
  origin?: Origin;
};

export type Migration = {
  /** `"props.<prop>.<option>": "<new option>"` or `"props.<prop>": "<new prop>"`. */
  renamed?: Record<string, string>;
  /** `"props.<prop>.<option>": "<replacement option>"` or `"props.<prop>": null` to drop the prop. */
  removed?: Record<string, string | null>;
};

export type ComponentDefinition<P extends Record<string, PropDefinition> = Record<string, PropDefinition>> = Omit<ComponentDef, "props"> & {
  props: P;
  migrations?: Record<number, Migration>;
};

type ChoiceInput<O extends Record<string, string>> = { default: keyof O & string; label?: string; catalog?: string };

/** An enum prop. The component receives the option key. */
export function choice<const O extends Record<string, string>>(
  options: O,
  opts: ChoiceInput<O>,
): ChoiceProp<keyof O & string> {
  return { kind: "choice", label: opts.label ?? "", options, default: opts.default, ...(opts.catalog ? { catalog: opts.catalog } : {}) };
}

/** A prop whose options each carry a typed value. The decider picks a key; the component receives its value. */
export function param<S extends z.ZodType, const O extends Record<string, { value: z.input<S>; when: string }>>(
  schema: S,
  opts: { options: O; default: keyof O & string; label?: string; catalog?: string },
): ParamProp<keyof O & string, z.output<S>> {
  return {
    kind: "param",
    label: opts.label ?? "",
    schema: schema as z.ZodType<z.output<S>>,
    options: opts.options as unknown as Record<keyof O & string, ParamOption<z.output<S>>>,
    default: opts.default,
    ...(opts.catalog ? { catalog: opts.catalog } : {}),
  };
}

/** The props a component implementation receives, typed from its definition. */
export type PropsOf<D extends { props: Record<string, PropDefinition> }> = {
  [K in keyof D["props"]]: D["props"][K] extends ChoiceProp<infer O> ? O : D["props"][K] extends ParamProp<string, infer V> ? V : never;
};

/** "timeFilter" -> "Time filter". */
export function labelFromKey(key: string) {
  const words = key.replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const isZod = (s: unknown): s is z.ZodType => typeof (s as z.ZodType | undefined)?.safeParse === "function";
const fromJson = new WeakMap<object, z.ZodType>();

/** The schema a `param` prop's values must parse with, whichever form the definition is in. */
export function schemaOf(prop: ParamProp): z.ZodType {
  if (isZod(prop.schema)) return prop.schema;
  let s = fromJson.get(prop.schema);
  if (!s) {
    s = z.fromJSONSchema(prop.schema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodType;
    fromJson.set(prop.schema, s);
  }
  return s;
}

/** Problems with a value for a `param` prop, or an empty list. */
export function checkParamValue(prop: ParamProp, value: unknown): string[] {
  const parsed = schemaOf(prop).safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`);
}

/** Problems with a definition's shape and props, or an empty list. */
export function checkComponentDef(def: ComponentDef): string[] {
  const errors: string[] = [];
  if (!ID.test(def.id)) errors.push(`id '${def.id}' must be kebab-case`);
  if (!def.title.trim()) errors.push("title is empty");
  if (!def.description.trim()) errors.push("description is empty");
  if (def.audiences && def.audiences.length === 0) errors.push("audiences is empty; leave it out to allow every audience");
  for (const [key, prop] of Object.entries(def.props)) {
    const keys = Object.keys(prop.options);
    if (keys.length < 2) errors.push(`prop '${key}' needs at least two options`);
    if (!(prop.default in prop.options)) errors.push(`prop '${key}' default '${prop.default}' is not one of its options`);
    for (const k of keys) {
      const o = (prop.options as Record<string, string | ParamOption>)[k];
      const when = typeof o === "string" ? o : o?.when;
      if (typeof when !== "string" || !when.trim()) errors.push(`option '${key}.${k}' has no description`);
    }
    if (prop.kind === "param") {
      try {
        for (const [k, o] of Object.entries(prop.options))
          for (const issue of checkParamValue(prop, o.value)) errors.push(`option '${key}.${k}' value does not parse: ${issue}`);
      } catch (e) {
        errors.push(`prop '${key}' has a schema that cannot be used: ${(e as Error).message}`);
      }
    }
  }
  return errors;
}

/**
 * Define a component. Rejects a definition with fewer than two options in a
 * prop, a default that is not an option, or a `param` option whose value does
 * not parse.
 */
export function defineComponent<const P extends Record<string, PropDefinition>>(input: {
  id: string;
  version?: number;
  title: string;
  description: string;
  audiences?: string[];
  catalog?: string;
  props: P;
  migrations?: Record<number, Migration>;
}): ComponentDefinition<P> {
  const props = Object.fromEntries(
    Object.entries(input.props).map(([key, prop]) => [key, { ...prop, label: prop.label || labelFromKey(key) }]),
  ) as P;
  const def: ComponentDefinition<P> = {
    id: input.id,
    version: input.version ?? 1,
    title: input.title,
    description: input.description,
    ...(input.audiences ? { audiences: input.audiences } : {}),
    ...(input.catalog ? { catalog: input.catalog } : {}),
    source: "builtin",
    props,
    ...(input.migrations ? { migrations: input.migrations } : {}),
  };
  const errors = checkComponentDef(def);
  if (errors.length) throw new Error(`defineComponent('${input.id}'):\n- ${errors.join("\n- ")}`);
  return def;
}

/** The JSON form of a definition: zod schemas become JSON Schema, migrations stay on the server. */
export function serializeComponent(def: ComponentDef): ComponentDef {
  const { migrations: _m, ...rest } = def as ComponentDefinition;
  return {
    ...rest,
    props: Object.fromEntries(
      Object.entries(def.props).map(([key, prop]) => [
        key,
        prop.kind === "param" && isZod(prop.schema) ? { ...prop, schema: z.toJSONSchema(prop.schema, { unrepresentable: "any" }) as JsonSchema } : prop,
      ]),
    ),
  };
}

export const supports = (def: ComponentDef, audience: string | null | undefined) =>
  !audience || !def.audiences || def.audiences.includes(audience);
