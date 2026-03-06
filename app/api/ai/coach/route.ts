import { NextRequest, NextResponse } from "next/server";
import type { CoachRequest, CoachResponse } from "@/lib/types";

const GROQ_BASE  = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

function friendlyError(status: number, message: string): Error {
  if (status === 429) return new Error("Rate limit reached. Wait 60 seconds and try again.");
  if (status === 401 || status === 403) return new Error("AI provider rejected the request — contact the site owner.");
  return new Error(message || `HTTP ${status}`);
}

async function callGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) throw friendlyError(res.status, data.error?.message ?? `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from AI");
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

  return raw.split(/\n\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 5);
}

export async function POST(req: NextRequest): Promise<NextResponse<CoachResponse>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { insights: [], error: "AI Coach is not configured on this server." },
      { status: 503 }
    );
  }

  let body: CoachRequest;
  try {
    body = (await req.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ insights: [], error: "Invalid request body" }, { status: 400 });
  }

  const { adviceType, systemPrompt, userPrompt } = body;
  if (!systemPrompt || !userPrompt) {
    return NextResponse.json({ insights: [], error: "Missing prompts" }, { status: 400 });
  }

  const maxTokens = adviceType === "daily" ? 800 : 1200;

  try {
    const raw = await callGroq(apiKey, systemPrompt, userPrompt, maxTokens, req.signal);
    return NextResponse.json({ insights: parseInsights(raw) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ insights: [], error: message }, { status: 502 });
  }
}
