import type { ReactNode } from "react";
import type { Subject } from "../../../shared/personas";
import { KitProvider } from "./store";

/** Wraps a component in one fixture's data during verification. */
export default function FixtureProvider({ fixture, children }: { fixture: { subject: Subject }; children: ReactNode }) {
  return <KitProvider subject={fixture.subject}>{children}</KitProvider>;
}
