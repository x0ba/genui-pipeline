import { describe, expect, test } from "bun:test";
import { HOST_GLOBAL } from "@malleable/core";
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import { renderToString } from "react-dom/server";
import { compile, staticCheck } from "../src";

const imports = ["react", "motion/react", "@kit"];
const ok = `
import { useMemo, useState } from "react";
import { useSubject } from "@kit";
type Props = { mark: "bar" | "pie"; bins: number[] };
export default function Chart({ mark, bins }: Props) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => bins.join("–"), [bins]);
  return <figure style={{ color: "var(--text)", fill: "currentColor" }} onClick={() => setOpen(!open)}>{mark} {label} {Math.max(...bins)}</figure>;
}`;

describe("staticCheck", () => {
  test("accepts a well-behaved component", () => {
    expect(staticCheck(ok, { imports })).toEqual([]);
  });

  test("rejects imports outside the allowlist, dynamic import and import.meta", () => {
    const errors = staticCheck(`import fs from "node:fs"; export default () => { import("x"); return import.meta.url; }`, { imports }).join("\n");
    expect(errors).toContain("import of 'node:fs' is not allowed");
    expect(errors).toContain("dynamic import()");
    expect(errors).toContain("import.meta");
  });

  test("rejects globals outside the allowlist, wherever they appear", () => {
    const errors = staticCheck(
      `export default function C() { const w = window; fetch("/x"); localStorage.x = 1; globalThis.y; new Function("x"); eval("1"); return <p>{document.title}</p>; }`,
      { imports },
    ).join("\n");
    for (const name of ["window", "fetch", "localStorage", "globalThis", "Function", "eval", "document"]) expect(errors).toContain(`'${name}'`);
  });

  test("does not mistake locals that shadow a global for the global", () => {
    expect(staticCheck(`export default function C({ document }: { document: string }) { const fetch = 1; return <p>{document}{fetch}</p>; }`, { imports })).toEqual([]);
  });

  test("rejects escapes through properties and injected markup", () => {
    const errors = staticCheck(
      `export default function C() { const f = (() => 1).constructor; return <div ref={(e) => e?.ownerDocument} dangerouslySetInnerHTML={{ __html: "x" }}><a href="javascript:alert(1)">x</a></div>; }`,
      { imports },
    ).join("\n");
    expect(errors).toContain("'constructor'");
    expect(errors).toContain("'ownerDocument'");
    expect(errors).toContain("dangerouslySetInnerHTML");
    expect(errors).toContain("javascript:");
  });

  test("rejects raw colour values but not tokens", () => {
    const errors = staticCheck(
      'export default function C() { return <svg><rect fill="red" stroke="#0af" /><text style={{ fill: `rgb(1 2 3)`, border: "1px solid black" }}>x</text></svg>; }',
      { imports },
    ).join("\n");
    expect(errors).toContain("fill: \"red\"");
    expect(errors).toContain("#0af");
    expect(errors).toContain("rgb(");
    expect(errors).toContain("1px solid black");
  });

  test("requires a default-exported function", () => {
    expect(staticCheck(`export const C = () => <p>x</p>;`, { imports }).join()).toContain("export default");
    expect(staticCheck(`const C = () => <p>hello</p>; export default C;`, { imports })).toEqual([]);
    expect(staticCheck(`import { memo } from "react"; export default memo(function C() { return <p>hi</p>; });`, { imports })).toEqual([]);
  });

  test("reports syntax errors with their location", () => {
    expect(staticCheck(`export default function C( { return 1 }`, { imports })[0]).toContain("line 1");
  });
});

describe("compile", () => {
  test("produces one module whose imports resolve through the host lookup", async () => {
    const out = await compile(ok, { imports });
    if ("errors" in out) throw new Error(out.errors.join("\n"));
    expect(out.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(out.code).not.toContain('from "react"');
    const modules: Record<string, unknown> = { react: React, "react/jsx-runtime": JsxRuntime, "@kit": { useSubject: () => null }, "motion/react": {} };
    (globalThis as Record<string, unknown>)[HOST_GLOBAL] = { require: (s: string) => modules[s] };
    const mod = await import(`data:text/javascript;base64,${Buffer.from(out.code).toString("base64")}`);
    const html = renderToString(React.createElement(mod.default, { mark: "pie", bins: [0, 2, 4] }));
    expect(html).toContain("pie");
    expect(html).toContain("0–2–4");
  });

  test("the hash changes when the code does", async () => {
    const a = await compile(ok, { imports });
    const b = await compile(ok.replace("Math.max", "Math.min"), { imports });
    expect("hash" in a && "hash" in b && a.hash !== b.hash).toBe(true);
  });
});
