import OpenAI from "openai";
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

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async extractReceiptFromImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<ExtractedReceipt> {
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: RECEIPT_PROMPT },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    return parseReceiptJson(text);
  }
}

function parseReceiptJson(text: string): ExtractedReceipt {
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
