import type { ComponentDefinition, PropDefinition, PropsOf } from "@malleable/core";
import type { ComponentType } from "react";

export type Implementation = { def: ComponentDefinition; Component: ComponentType<never> };

/** Pair a definition with the component that renders it. Its props are typed from the definition. */
export function implement<const D extends ComponentDefinition<Record<string, PropDefinition>>>(def: D, Component: ComponentType<PropsOf<D>>): Implementation {
  return { def, Component: Component as ComponentType<never> };
}
