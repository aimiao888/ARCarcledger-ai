import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function extractResponseText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;

  const content = data.output?.flatMap((item: any) => item.content || []) || [];
  const text = content.find((item: any) => item.type === "output_text" || item.type === "text");
  return text?.text || data.choices?.[0]?.message?.content || "";
}

async function callOpenAI(instructions: string, input: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions,
      input
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  return extractResponseText(await response.json());
}

async function callOpenClaw(instructions: string, input: string) {
  const baseUrl = process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789";
  const apiKey = process.env.OPENCLAW_API_KEY;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.OPENCLAW_MODEL || process.env.AI_MODEL || "default",
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenClaw request failed: ${response.status} ${await response.text()}`);
  }

  return extractResponseText(await response.json());
}

async function callConfiguredAi(instructions: string, input: string) {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  if (provider === "openclaw") {
    return callOpenClaw(instructions, input);
  }

  return callOpenAI(instructions, input);
}

function aiProxy(): Plugin {
  return {
    name: "arcledger-ai-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ai", async (req, res) => {
        if (req.method !== "POST") {
          writeJson(res, 405, { error: "Method not allowed" });
          return;
        }

        try {
          const body = await readJson(req);
          const url = req.url || "";

          if (url.startsWith("/parse-invoice")) {
            const text = await callConfiguredAi(
              [
                "You parse natural language payment requests into invoice fields.",
                "Return only compact JSON with keys: payer, amount, memo, dueDate, note.",
                "payer must be an EVM address or empty string. amount is a decimal USDC string.",
                "dueDate is YYYY-MM-DD or empty string. memo is short and business-like."
              ].join(" "),
              String(body.prompt || "")
            );
            writeJson(res, 200, { text });
            return;
          }

          if (url.startsWith("/summary")) {
            const text = await callConfiguredAi(
              [
                "You are a concise treasury assistant for an Arc USDC invoicing app.",
                "Summarize cash position, paid/received status, and next action in 2-4 short sentences.",
                "Do not provide investment advice. Focus on operational finance."
              ].join(" "),
              JSON.stringify(body)
            );
            writeJson(res, 200, { text });
            return;
          }

          if (url.startsWith("/reminder")) {
            const text = await callConfiguredAi(
              [
                "Write a short professional invoice payment reminder.",
                "Mention USDC settlement on Arc if natural. Keep it under 90 words.",
                "Do not include threats or legal language."
              ].join(" "),
              JSON.stringify(body)
            );
            writeJson(res, 200, { text });
            return;
          }

          writeJson(res, 404, { error: "Unknown AI endpoint" });
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : "AI request failed" });
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), aiProxy()]
});
