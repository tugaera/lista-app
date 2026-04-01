import Dexie, { type EntityTable } from "dexie";

export interface PendingMutation {
  id: number;
  table: string;
  operation: "insert" | "update" | "delete";
  data: Record<string, unknown>;
  timestamp: number;
}

export interface OfflineCartItem {
  id: string;
  productName: string;
  price: number;
  quantity: number;
  storeId: string;
  storeName: string;
  createdAt: string;
}

class MeuCestoOfflineDB extends Dexie {
  pendingMutations!: EntityTable<PendingMutation, "id">;
  offlineCartItems!: EntityTable<OfflineCartItem, "id">;

  constructor() {
    super("meu-cesto-offline");

    this.version(1).stores({
      pendingMutations: "++id, table, operation, timestamp",
      offlineCartItems: "id, storeId, createdAt",
    });
  }
}

const db = new MeuCestoOfflineDB();

export default db;
