import type { AIProvider } from "./types";

export const AI_PROVIDERS: AIProvider[] = ["openai", "gemini", "anthropic", "groq"];

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai:    "OpenAI",
  gemini:    "Google Gemini",
  anthropic: "Anthropic",
  groq:      "Groq",
};

export const AI_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai:    "gpt-4o-mini",
  gemini:    "gemini-2.0-flash",
  anthropic: "claude-haiku-4-5-20251001",
  groq:      "llama-3.3-70b-versatile",
};

export const AI_PROVIDER_KEY_URLS: Record<AIProvider, string> = {
  openai:    "platform.openai.com/api-keys",
  gemini:    "aistudio.google.com/app/apikey",
  anthropic: "console.anthropic.com/settings/keys",
  groq:      "console.groq.com/keys",
};
