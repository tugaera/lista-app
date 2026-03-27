import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ExtractedReceipt } from "./types";

const RECEIPT_PROMPT = `Analyze this receipt image and extract all line items.
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "store_name": "string or null",
  "date": "string or null",
  "items": [
    { "name": "product name", "quantity": 1, "unit_price": 0.00, "total": 0.00 }
  ],
  "grand_total": 0.00
}
Rules:
- quantity must be a number (default 1 if not shown)
- unit_price and total must be numbers (not strings)
- If a value cannot be determined, use null
- Include ALL line items visible on the receipt`;

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async extractReceiptFromImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<ExtractedReceipt> {
    const validMimeType = (
      ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
        ? mimeType
        : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: validMimeType, data: imageBase64 },
            },
            { type: "text", text: RECEIPT_PROMPT },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return parseReceiptJson(text);
  }
}

function parseReceiptJson(text: string): ExtractedReceipt {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      grand_total: parsed.grand_total ?? null,
      store_name: parsed.store_name ?? null,
      date: parsed.date ?? null,
    };
  } catch {
    return { items: [], grand_total: null, store_name: null, date: null };
  }
}
