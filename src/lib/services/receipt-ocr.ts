export interface OcrLineItem {
  name: string;
  price: number;
  quantity: number;
  confidence: number; // 0-1
}

export interface OcrResult {
  items: OcrLineItem[];
  total: number | null;
  storeName: string | null;
  date: string | null;
  rawText: string;
}

export interface ReceiptOcrService {
  processImage(imageUrl: string): Promise<OcrResult>;
}

class MockReceiptOcrService implements ReceiptOcrService {
  async processImage(_imageUrl: string): Promise<OcrResult> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const mockItems: OcrLineItem[] = [
      { name: "Organic Whole Milk 1L", price: 3.49, quantity: 1, confidence: 0.95 },
      { name: "Sourdough Bread", price: 4.99, quantity: 1, confidence: 0.92 },
      { name: "Free Range Eggs 12pk", price: 5.29, quantity: 1, confidence: 0.88 },
      { name: "Banana", price: 0.69, quantity: 6, confidence: 0.91 },
      { name: "Cheddar Cheese 200g", price: 3.99, quantity: 1, confidence: 0.87 },
      { name: "Chicken Breast 500g", price: 7.49, quantity: 1, confidence: 0.93 },
      { name: "Roma Tomatoes", price: 1.29, quantity: 4, confidence: 0.85 },
      { name: "Olive Oil 500ml", price: 6.99, quantity: 1, confidence: 0.96 },
    ];

    const total = mockItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    return {
      items: mockItems,
      total: Math.round(total * 100) / 100,
      storeName: "Fresh Market",
      date: new Date().toISOString().split("T")[0],
      rawText: [
        "FRESH MARKET",
        "123 Main Street",
        "------------------------",
        ...mockItems.map(
          (item) =>
            `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}  $${(item.price * item.quantity).toFixed(2)}`
        ),
        "------------------------",
        `TOTAL  $${total.toFixed(2)}`,
        "",
        "Thank you for shopping!",
      ].join("\n"),
    };
  }
}

export function createOcrService(): ReceiptOcrService {
  return new MockReceiptOcrService();
}
