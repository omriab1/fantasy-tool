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

export const AI_PROVIDER_FULL_URLS: Record<AIProvider, string> = {
  openai:    "https://platform.openai.com/api-keys",
  gemini:    "https://aistudio.google.com/app/apikey",
  anthropic: "https://console.anthropic.com/settings/keys",
  groq:      "https://console.groq.com/keys",
};

export const AI_PROVIDER_DESCRIPTIONS: Record<AIProvider, string> = {
  openai:    "Pay-per-use · GPT-4o mini is very cheap (fractions of a cent per analysis)",
  gemini:    "Free tier available · Gemini 2.0 Flash is fast and free to start",
  anthropic: "Pay-per-use · Claude Haiku is fast and affordable",
  groq:      "Free tier available · Llama 3.3 runs at lightning speed for free",
};
