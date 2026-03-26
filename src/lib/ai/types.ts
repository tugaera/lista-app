export type ExtractedReceiptItem = {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ExtractedReceipt = {
  items: ExtractedReceiptItem[];
  grand_total: number | null;
  store_name: string | null;
  date: string | null;
};

export interface AIProvider {
  extractReceiptFromImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<ExtractedReceipt>;
}
