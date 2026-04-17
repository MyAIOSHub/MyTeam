import { z } from "zod";
import type { HubClient } from "../client/hub-client.js";
import type { Interaction } from "@agentmesh/shared";

export function registerChatTool(server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, client: HubClient, state: { agentId?: string }) {
  server.registerTool(
    "agentmesh_chat",
    {
      description:
        "Send a message to another agent and wait for their reply. " +
        "Use this for direct conversational interaction where you expect a response. " +
        "The tool will poll for a reply until one arrives or the timeout is reached.",
      inputSchema: {
        toAgentId: z.string().describe("The agentId of the agent to chat with"),
        text: z.string().describe("The message text to send"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .optional()
          .describe("Max time to wait for reply in ms (default 30000, max 120000)"),
      },
    },
    async ({ toAgentId, text, timeoutMs }) => {
      if (!state.agentId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not registered. Call agentmesh_register first." }) }],
          isError: true,
        };
      }

      const correlationId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = timeoutMs ?? 30000;

      // Send message with expectReply
      const sent = await client.sendInteraction({
        type: "message",
        contentType: "text",
        target: { agentId: toAgentId },
        payload: { text },
        metadata: {
          expectReply: true,
          correlationId,
        },
      });

      // Poll for reply matching correlationId
      const startTime = Date.now();
      const pollInterval = 1500;
      let lastId: string | undefined;

      while (Date.now() - startTime < timeout) {
        await sleep(pollInterval);

        const result = await client.pollInteractions(state.agentId!, { afterId: lastId, limit: 50 });
        const interactions: Interaction[] = result.interactions ?? [];

        const last = interactions.at(-1);
        if (last) {
          lastId = last.id;
        }

        // Find reply from target agent with matching correlationId
        const reply = interactions.find(
          (i) =>
            (i.fromId ?? i.fromAgent) === toAgentId &&
            i.metadata?.correlationId === correlationId,
        );

        if (reply) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    reply: reply.payload.text ?? reply.payload.data,
                    fromAgent: reply.fromAgent,
                    interactionId: reply.id,
                    correlationId,
                    sentId: sent.id,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }

      // Timeout — no reply received
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "timeout",
                message: `No reply from ${toAgentId} within ${timeout}ms`,
                correlationId,
                sentId: sent.id,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
