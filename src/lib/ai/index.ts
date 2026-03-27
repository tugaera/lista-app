import type { AIProvider } from "./types";

export type { AIProvider, ExtractedReceipt, ExtractedReceiptItem } from "./types";

export function getAIProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = require("./anthropic");
    return new AnthropicProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    const { OpenAIProvider } = require("./openai");
    return new OpenAIProvider();
  }
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.",
  );
}
