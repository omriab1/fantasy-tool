import { NextRequest, NextResponse } from "next/server";
import { AI_DEFAULT_MODELS } from "@/lib/ai-providers";
import type { AIProvider, CoachRequest, CoachResponse } from "@/lib/types";

async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI provider");
  return text;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }

  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Anthropic");
  return text;
}

function parseInsights(raw: string): string[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+[.)]\s/.test(l))
    .map((l) => l.replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length > 0) return lines;

  // Fallback: split by double newline (paragraphs)
  return raw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export async function POST(req: NextRequest): Promise<NextResponse<CoachResponse>> {
  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ insights: [], error: "Invalid request body" }, { status: 400 });
  }

  const { provider, apiKey, model, adviceType, systemPrompt, userPrompt } = body;

  if (!apiKey) {
    return NextResponse.json({ insights: [], error: "Missing API key" }, { status: 400 });
  }
  if (!systemPrompt || !userPrompt) {
    return NextResponse.json({ insights: [], error: "Missing prompts" }, { status: 400 });
  }

  const resolvedModel = model?.trim() || AI_DEFAULT_MODELS[provider as AIProvider] || "gpt-4o-mini";
  const maxTokens = adviceType === "daily" ? 800 : 1200;

  try {
    let raw: string;

    switch (provider as AIProvider) {
      case "openai":
        raw = await callOpenAICompat(
          "https://api.openai.com/v1",
          apiKey,
          resolvedModel,
          systemPrompt,
          userPrompt,
          maxTokens
        );
        break;

      case "groq":
        raw = await callOpenAICompat(
          "https://api.groq.com/openai/v1",
          apiKey,
          resolvedModel,
          systemPrompt,
          userPrompt,
          maxTokens
        );
        break;

      case "gemini":
        raw = await callOpenAICompat(
          "https://generativelanguage.googleapis.com/v1beta/openai",
          apiKey,
          resolvedModel,
          systemPrompt,
          userPrompt,
          maxTokens
        );
        break;

      case "anthropic":
        raw = await callAnthropic(apiKey, resolvedModel, systemPrompt, userPrompt, maxTokens);
        break;

      default:
        return NextResponse.json(
          { insights: [], error: `Unknown provider: ${provider}` },
          { status: 400 }
        );
    }

    const insights = parseInsights(raw);
    return NextResponse.json({ insights });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ insights: [], error: message }, { status: 502 });
  }
}
