import { parse } from "acorn";
import { transformSync, type Message } from "esbuild";
import type * as ESTree from "estree";
import { analyze } from "periscopic";

// Static checks on a generated module's syntax tree, run before it is compiled
// or rendered anywhere. They make misuse hard; they are not a sandbox.

/** Globals a component may reference. Everything else, such as window, document, fetch or storage, is rejected. */
const GLOBALS = new Set(
  `Array ArrayBuffer AggregateError BigInt Boolean DataView Date Error Float32Array Float64Array Int8Array Int16Array Int32Array
  Intl Iterator JSON Map Math NaN Infinity Number Object Promise RangeError ReferenceError RegExp Set String Symbol SyntaxError
  TypeError URIError Uint8Array Uint8ClampedArray Uint16Array Uint32Array WeakMap WeakSet undefined isFinite isNaN parseFloat
  parseInt encodeURIComponent decodeURIComponent structuredClone queueMicrotask setTimeout clearTimeout setInterval clearInterval
  requestAnimationFrame cancelAnimationFrame console performance ResizeObserver IntersectionObserver DOMRect AbortController
  getComputedStyle matchMedia Element HTMLElement SVGElement SVGGraphicsElement Node Event KeyboardEvent MouseEvent PointerEvent
  FocusEvent`.split(/\s+/),
);

/** Properties that reach the document, the global object or the Function constructor, or inject markup. */
const PROPERTIES = new Set([
  "constructor",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "ownerDocument",
  "defaultView",
  "contentWindow",
  "contentDocument",
  "getRootNode",
  "cookie",
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "srcdoc",
  "dangerouslySetInnerHTML",
]);

const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color-mix)\(/i;
const HEX = /(?:^|[\s,(:])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-z_-])/i;
const COLOUR_KEYS = /^(?:fill|stroke|color|stopColor|floodColor|lightingColor|caretColor|accentColor|textDecorationColor|columnRuleColor|background\w*|border\w*|outline\w*|boxShadow|textShadow)$/;
const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue
  chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
  darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
  darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen
  lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive
  olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke
  yellow yellowgreen`.split(/\s+/),
);

const ALWAYS = ["react", "react/jsx-runtime"];

type Node = ESTree.Node & { start: number; end: number };

function walk(node: unknown, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit, parent);
    return;
  }
  const n = node as Node;
  if (typeof n.type !== "string") return;
  visit(n, parent);
  for (const [key, value] of Object.entries(n)) if (key !== "loc" && value && typeof value === "object") walk(value, visit, n);
}

const isFunction = (n: ESTree.Node | null | undefined) =>
  !!n && (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression");
const isComponentCall = (n: ESTree.Node | null | undefined) => {
  if (n?.type !== "CallExpression") return false;
  const c = n.callee;
  const name = c.type === "Identifier" ? c.name : c.type === "MemberExpression" && c.property.type === "Identifier" ? c.property.name : "";
  return name === "memo" || name === "forwardRef";
};

const formatEsbuild = (m: Message) => `${m.location ? `line ${m.location.line}:${m.location.column}: ` : ""}${m.text}`;

/** Problems with a generated module's source, or an empty list. */
export function staticCheck(source: string, opts: { imports: string[] }): string[] {
  let js: string;
  try {
    // verbatimModuleSyntax keeps imports the transform cannot see used, so none escapes the check.
    js = transformSync(source, {
      loader: "tsx",
      jsx: "automatic",
      format: "esm",
      target: "es2022",
      logLevel: "silent",
      tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
    }).code;
  } catch (e) {
    const errors = (e as { errors?: Message[] }).errors;
    return errors?.length ? errors.map((m) => `does not compile: ${formatEsbuild(m)}`) : [`does not compile: ${(e as Error).message}`];
  }
  let ast: ESTree.Program;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "module" }) as unknown as ESTree.Program;
  } catch (e) {
    return [`does not parse: ${(e as Error).message}`];
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const push = (msg: string) => {
    if (!seen.has(msg)) errors.push(msg), seen.add(msg);
  };
  const allowed = new Set([...ALWAYS, ...opts.imports]);
  const allowedList = [...new Set(["react", ...opts.imports])].join(", ");
  const snippet = (n: Node) => js.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 60);

  for (const name of analyze(ast).globals.keys())
    if (!GLOBALS.has(name) && name !== "import")
      push(`uses the global '${name}'. Components may not reach the page, the network or storage; get data and actions from the kit`);

  const topLevel = new Map<string, ESTree.Node | null>();
  for (const stmt of ast.body) {
    if (stmt.type === "FunctionDeclaration" && stmt.id) topLevel.set(stmt.id.name, stmt);
    if (stmt.type === "VariableDeclaration")
      for (const d of stmt.declarations) if (d.id.type === "Identifier") topLevel.set(d.id.name, d.init ?? null);
  }
  let defaultExport: ESTree.Node | null | undefined;

  walk(ast, (n) => {
    switch (n.type) {
      case "ImportDeclaration":
      case "ExportAllDeclaration":
        if (!allowed.has(String(n.source.value))) push(`import of '${n.source.value}' is not allowed; use only ${allowedList}`);
        break;
      case "ExportNamedDeclaration":
        if (n.source && !allowed.has(String(n.source.value))) push(`import of '${n.source.value}' is not allowed; use only ${allowedList}`);
        for (const s of n.specifiers)
          if (s.exported.type === "Identifier" && s.exported.name === "default" && s.local.type === "Identifier") defaultExport = s.local;
        break;
      case "ExportDefaultDeclaration":
        defaultExport = n.declaration as ESTree.Node;
        break;
      case "ImportExpression":
        push("dynamic import() is not allowed");
        break;
      case "MetaProperty":
        push(`'${snippet(n)}' is not allowed`);
        break;
      case "MemberExpression": {
        const p = n.property;
        const name = !n.computed && p.type === "Identifier" ? p.name : p.type === "Literal" && typeof p.value === "string" ? p.value : null;
        if (name && PROPERTIES.has(name)) push(`'${snippet(n)}' is not allowed: '${name}' reaches outside the component or injects markup`);
        break;
      }
      case "Property": {
        const k = n.key;
        const key = k.type === "Identifier" ? k.name : k.type === "Literal" ? String(k.value) : null;
        if (key && PROPERTIES.has(key)) push(`'${key}' is not allowed: it injects markup or reaches outside the component`);
        if (key && COLOUR_KEYS.test(key) && n.value.type === "Literal" && typeof n.value.value === "string") {
          const word = n.value.value.toLowerCase().split(/[\s,()]+/).find((w) => NAMED.has(w));
          if (word) push(`raw colour '${key}: "${n.value.value}"': use only the design contract's colour tokens, which are checked for contrast in every theme`);
        }
        break;
      }
      case "Literal":
      case "TemplateElement": {
        const text = n.type === "Literal" ? (typeof n.value === "string" ? n.value : null) : (n.value.cooked ?? n.value.raw);
        if (text === null) break;
        if (/^\s*javascript:/i.test(text)) push("javascript: URLs are not allowed");
        const hit = text.match(COLOUR_FN) ?? text.match(HEX);
        if (hit) push(`raw colour '${hit[0].trim()}' in "${text.slice(0, 50)}": use only the design contract's colour tokens, which are checked for contrast in every theme`);
        break;
      }
    }
  });

  for (let hops = 0; defaultExport?.type === "Identifier" && hops < 5; hops++) defaultExport = topLevel.get(defaultExport.name) ?? null;
  if (!(isFunction(defaultExport) || isComponentCall(defaultExport))) push("the module must `export default` a React function component");
  return errors;
}
