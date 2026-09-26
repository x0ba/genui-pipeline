import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import type { Subject } from "../../../shared/spec";
import { KitProvider } from "./store";

/** Server-side render used to validate generated components before install. */
export function renderForCheck(
  Component: ComponentType<{ props: Record<string, string> }>,
  props: Record<string, string>,
  subject: Subject,
) {
  return renderToString(
    <KitProvider subject={subject}>
      <Component props={props} />
    </KitProvider>,
  );
}
