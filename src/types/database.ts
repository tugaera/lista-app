export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      stores: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          barcode: string | null;
          category_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          barcode?: string | null;
          category_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_entries: {
        Row: {
          id: string;
          product_id: string;
          store_id: string;
          price: number;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          store_id: string;
          price: number;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          store_id?: string;
          price?: number;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_entries_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_entries_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      shopping_list_items: {
        Row: {
          id: string;
          list_id: string;
          product_id: string;
          planned_quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          product_id: string;
          planned_quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          product_id?: string;
          planned_quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "shopping_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_carts: {
        Row: {
          id: string;
          user_id: string;
          total: number;
          receipt_image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          total: number;
          receipt_image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          total?: number;
          receipt_image_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "admin" | "moderator" | "user";
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "admin" | "moderator" | "user";
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "admin" | "moderator" | "user";
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          code: string;
          created_by: string;
          assigned_role: "admin" | "moderator" | "user";
          used_by: string | null;
          used_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          created_by: string;
          assigned_role?: "admin" | "moderator" | "user";
          used_by?: string | null;
          used_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          created_by?: string;
          assigned_role?: "admin" | "moderator" | "user";
          used_by?: string | null;
          used_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shopping_cart_items: {
        Row: {
          id: string;
          cart_id: string;
          product_entry_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          product_entry_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          product_entry_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "shopping_carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_cart_items_product_entry_id_fkey";
            columns: ["product_entry_id"];
            isOneToOne: false;
            referencedRelation: "product_entries";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      latest_product_prices: {
        Row: {
          id: string;
          product_id: string;
          store_id: string;
          price: number;
          quantity: number;
          created_at: string;
          product_name: string;
          barcode: string | null;
          store_name: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      validate_invite_code: {
        Args: { invite_code: string };
        Returns: boolean;
      };
      consume_invite: {
        Args: { invite_code: string; user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: Record<string, never>;
  };
}

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  T extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][T]["Row"];

export type TablesInsert<
  T extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<
  T extends keyof PublicSchema["Tables"],
> = PublicSchema["Tables"][T]["Update"];

export type Views<
  T extends keyof PublicSchema["Views"],
> = PublicSchema["Views"][T]["Row"];

// Convenience aliases
export type Category = Tables<"categories">;
export type CategoryInsert = TablesInsert<"categories">;
export type CategoryUpdate = TablesUpdate<"categories">;

export type Store = Tables<"stores">;
export type StoreInsert = TablesInsert<"stores">;
export type StoreUpdate = TablesUpdate<"stores">;

export type Product = Tables<"products">;
export type ProductInsert = TablesInsert<"products">;
export type ProductUpdate = TablesUpdate<"products">;

export type ProductEntry = Tables<"product_entries">;
export type ProductEntryInsert = TablesInsert<"product_entries">;
export type ProductEntryUpdate = TablesUpdate<"product_entries">;

export type ShoppingList = Tables<"shopping_lists">;
export type ShoppingListInsert = TablesInsert<"shopping_lists">;
export type ShoppingListUpdate = TablesUpdate<"shopping_lists">;

export type ShoppingListItem = Tables<"shopping_list_items">;
export type ShoppingListItemInsert = TablesInsert<"shopping_list_items">;
export type ShoppingListItemUpdate = TablesUpdate<"shopping_list_items">;

export type ShoppingCart = Tables<"shopping_carts">;
export type ShoppingCartInsert = TablesInsert<"shopping_carts">;
export type ShoppingCartUpdate = TablesUpdate<"shopping_carts">;

export type ShoppingCartItem = Tables<"shopping_cart_items">;
export type ShoppingCartItemInsert = TablesInsert<"shopping_cart_items">;
export type ShoppingCartItemUpdate = TablesUpdate<"shopping_cart_items">;

export type LatestProductPrice = Views<"latest_product_prices">;

export type Profile = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;

export type Invite = Tables<"invites">;
export type InviteInsert = TablesInsert<"invites">;
export type InviteUpdate = TablesUpdate<"invites">;

export type UserRole = Database["public"]["Enums"]["user_role"];
