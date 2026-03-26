import type { ProductEntry } from "@/types/database";

interface EntryWithStore extends ProductEntry {
  stores: { name: string } | null;
}

interface ChartDataset {
  storeName: string;
  prices: number[];
}

interface PriceChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export function preparePriceChartData(
  entries: EntryWithStore[]
): PriceChartData {
  // Collect all unique dates and store names
  const dateSet = new Set<string>();
  const storeMap = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    const dateLabel = new Date(entry.created_at).toLocaleDateString();
    dateSet.add(dateLabel);

    const storeName = entry.stores?.name ?? "Unknown";
    if (!storeMap.has(storeName)) {
      storeMap.set(storeName, new Map());
    }
    storeMap.get(storeName)!.set(dateLabel, entry.price);
  }

  const labels = Array.from(dateSet);

  const datasets: ChartDataset[] = [];
  for (const [storeName, pricesByDate] of storeMap) {
    datasets.push({
      storeName,
      prices: labels.map((label) => pricesByDate.get(label) ?? 0),
    });
  }

  return { labels, datasets };
}

interface StoreComparison {
  store_name: string;
  price: number;
}

interface BarChartData {
  labels: string[];
  prices: number[];
}

export function prepareStoreComparisonData(
  comparisons: StoreComparison[]
): BarChartData {
  const sorted = [...comparisons].sort((a, b) => a.price - b.price);

  return {
    labels: sorted.map((c) => c.store_name),
    prices: sorted.map((c) => c.price),
  };
}
