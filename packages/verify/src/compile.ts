import { HOST_GLOBAL } from "@malleable/core";
import { build, type Message } from "esbuild";

// Compile a generated component to one ES module. Its imports resolve through
// a lookup the host page provides, so the module uses the host's own React
// instance whichever bundler the host uses. No import maps and no eval: it
// loads with a plain import() under a strict content security policy.

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function compile(source: string, opts: { imports: string[] }): Promise<{ code: string; hash: string } | { errors: string[] }> {
  const allowed = new Set(["react", "react/jsx-runtime", ...opts.imports]);
  try {
    const out = await build({
      stdin: { contents: source, loader: "tsx", sourcefile: "component.tsx" },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      legalComments: "none",
      logLevel: "silent",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      plugins: [
        {
          name: "malleable-host",
          setup(b) {
            b.onResolve({ filter: /.*/ }, (args) =>
              allowed.has(args.path)
                ? { path: args.path, namespace: "malleable-host" }
                : { errors: [{ text: `import of '${args.path}' is not allowed` }] },
            );
            b.onLoad({ filter: /.*/, namespace: "malleable-host" }, (args) => ({
              contents: `module.exports = globalThis.${HOST_GLOBAL}.require(${JSON.stringify(args.path)});`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const code = out.outputFiles[0]!.text;
    return { code, hash: (await sha256(code)).slice(0, 16) };
  } catch (e) {
    const errors = (e as { errors?: Message[] }).errors;
    return { errors: errors?.length ? errors.map((m) => `does not compile: ${m.text}`) : [`does not compile: ${(e as Error).message}`] };
  }
}
