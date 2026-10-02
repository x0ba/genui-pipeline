import { createSdkMcpServer, query, tool, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { Builder, BuilderRun } from "@malleable/core";

// The builder adapter for Claude through the Agent SDK. Claude sees no built-in
// tools, only the library's tools served in-process, so everything it produces
// passes through the library's validation before anyone can use it.

export type ClaudeBuilderOptions = {
  /** Default: `CLAUDE_MODEL`, then claude-opus-5-5. */
  model?: string;
  maxTurns?: number;
  /** Cost cap per run, in US dollars. */
  maxUsd?: number;
  effort?: Partial<Record<BuilderRun["kind"], "low" | "medium" | "high" | "xhigh">>;
  /** Working directory for the agent process. It reads nothing from it. */
  cwd?: string;
  debug?: boolean;
};

const SERVER = "malleable";
const PREFIX = `mcp__${SERVER}__`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = SdkMcpToolDefinition<any>;

export function claudeBuilder(options: ClaudeBuilderOptions = {}): Builder {
  const model = options.model ?? process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
  const effort = { personalize: "medium", extend: "high", ...options.effort } as const;

  return {
    model,
    async run(run) {
      const tools: AnyTool[] = run.tools.map((t) =>
        tool(
          t.name,
          t.description,
          t.input,
          async (input: Record<string, unknown>) => {
            const result = await t.run(input);
            return { content: [{ type: "text" as const, text: result.text }], ...(result.ok ? {} : { isError: true }) };
          },
          t.readOnly ? { annotations: { readOnlyHint: true } } : undefined,
        ),
      );
      const server = createSdkMcpServer({ name: SERVER, version: "1.0.0", tools });
      let costUsd = 0;
      let turns = 0;
      let error: string | undefined;
      try {
        for await (const message of query({
          prompt: run.prompt,
          options: {
            model,
            effort: effort[run.kind],
            systemPrompt: run.system,
            mcpServers: { [SERVER]: server },
            tools: [],
            allowedTools: [`${PREFIX}*`],
            permissionMode: "dontAsk",
            settingSources: [],
            persistSession: false,
            maxTurns: options.maxTurns ?? 40,
            maxBudgetUsd: options.maxUsd ?? 6,
            ...(options.cwd ? { cwd: options.cwd } : {}),
            // Only the library's tools: no claude.ai connectors or user MCP
            // servers, loaded upfront so the model never has to search for them.
            strictMcpConfig: true,
            env: { ...process.env, ENABLE_TOOL_SEARCH: "false" },
          },
        })) {
          if (message.type === "system" && message.subtype === "init") {
            const mine = message.tools.filter((t) => t.startsWith(PREFIX));
            const status = message.mcp_servers.find((m) => m.name === SERVER)?.status;
            if (options.debug) console.log("[builder-claude] init", status, mine);
            if (status !== "connected" || mine.length < tools.length)
              console.warn(`[builder-claude ${run.runId}] MCP ${status}; ${mine.length}/${tools.length} tools registered`);
          } else if (message.type === "assistant") {
            if (message.error) error = `assistant error: ${message.error}`;
            for (const block of message.message.content) if (block.type === "text" && block.text.trim()) run.onText?.(block.text);
          } else if (message.type === "result") {
            costUsd = message.total_cost_usd;
            turns = message.num_turns;
            if (message.subtype !== "success") error = message.subtype;
          }
        }
      } catch (e) {
        error = (e as Error).message;
      }
      return { ok: !error && run.done(), costUsd, turns, ...(error ? { error } : {}) };
    },
  };
}
