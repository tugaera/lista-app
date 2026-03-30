# Lista App

A collaborative shopping list and cart management system with real-time sync, barcode scanning, price tracking, and offline support.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| UI | React 19, Tailwind CSS 4 |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Offline / PWA | Serwist (service worker), Dexie (IndexedDB) |
| AI (optional) | Anthropic Claude SDK, OpenAI SDK (receipt scanning) |
| Monitoring | Vercel Analytics, Vercel Speed Insights |
| Language | TypeScript 6 |

## Features

- **Shopping Cart** -- add products by name or barcode scan, track prices, apply discounts, finalize to history
- **Shopping Lists** -- plan purchases, link products or add free-text items, track quantities
- **Real-time Collaboration** -- share carts and lists with other users; items sync instantly via Supabase Realtime broadcast
- **List Tracking** -- attach a shopping list to a cart to see what you still need to buy, with auto-matching and manual check/uncheck
- **Price History** -- every finalized purchase creates an append-only price entry; view trends per product per store
- **Barcode Scanning** -- scan barcodes to look up products (local DB + Open Food Facts API)
- **Discount Tracking** -- original price vs final price, percentage/amount calculation
- **Role-based Access** -- admin, moderator, user roles with invite-code signup
- **PWA / Offline** -- installable app, offline page caching, queued mutations sync on reconnect
- **Receipt Upload** -- attach photos to cart history; optional AI-powered receipt OCR

## Architecture Overview

```
Browser (React 19)
  |
  |-- Server Components (SSR, data fetching)
  |-- Server Actions (mutations, business logic)
  |-- Client Components (interactivity, realtime)
  |
Supabase
  |-- PostgreSQL (tables, views, RLS, security definer functions)
  |-- Auth (email/password, invite codes)
  |-- Realtime (broadcast channels for shared carts/lists)
  |-- Storage (receipt images)
```

### Data Access Pattern

For shared data (carts/lists shared between users), the app uses **security definer RPC functions** that bypass Row-Level Security while performing their own access checks. This avoids complex RLS policies and ensures shared users can read/write data they have access to.

Pattern: try direct query first (fast, works for owners) -> fall back to RPC (works for shared users).

## Database Schema

### Entity Relationship

```
profiles (1) ---- (*) invites          (invite system)
profiles (1) ---- (*) shopping_lists   (user owns lists)
profiles (1) ---- (*) shopping_carts   (user owns carts)

shopping_lists (1) ---- (*) shopping_list_items
shopping_lists (1) ---- (*) list_shares

shopping_carts (1) ---- (*) shopping_cart_items
shopping_carts (1) ---- (*) cart_shares
shopping_carts (1) ---- (*) cart_receipt_images
shopping_carts (*) ---- (1) stores
shopping_carts (*) ---0 (1) shopping_lists      (tracking_list_id)

products (1) ---- (*) product_entries   (price history)
products (1) ---0 (*) shopping_cart_items
products (1) ---0 (*) shopping_list_items

stores (1) ---- (*) product_entries
categories (1) ---0 (*) products
```

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User accounts (extends auth.users) | id, email, role (admin/moderator/user), invited_by |
| `invites` | Signup authorization | code, created_by, assigned_role, used_by, expires_at |
| `stores` | Shop locations | name, is_active, sort_order |
| `categories` | Product categories | name |
| `products` | Master product list | name, barcode (unique), category_id, is_active |
| `product_entries` | Price history (append-only) | product_id, store_id, price, original_price, quantity |
| `shopping_lists` | Planning lists | user_id, name |
| `shopping_list_items` | Items in lists | list_id, product_id (nullable), product_name, planned_quantity, added_by |
| `shopping_carts` | Active/finalized carts | user_id, store_id, tracking_list_id, tracking_check_state (jsonb), total, finalized_at |
| `shopping_cart_items` | Items in cart | cart_id, product_id, product_name, barcode, price, original_price, quantity, added_by |
| `cart_shares` | Cart collaboration | cart_id, owner_id, shared_with_email, shared_with_user_id |
| `list_shares` | List collaboration | list_id, owner_id, shared_with_email, shared_with_user_id |
| `cart_receipt_images` | Receipt photos | cart_id, image_url, sort_order |

### Views

| View | Purpose |
|------|---------|
| `latest_product_prices` | Most recent price per product per store (used for search results and price display) |

### Security Definer Functions (RPCs)

These functions run with elevated privileges, bypassing RLS while checking access internally.

**Profile lookups:**
- `get_my_role()` -- current user's role
- `get_profile_id_by_email(email)` -- find user by email (for sharing)
- `get_profile_email_by_id(user_id)` -- display user email (for shared item attribution)

**Authentication:**
- `validate_invite_code(code)` -- check if invite is valid (callable by anonymous users)
- `consume_invite(code, user_id)` -- use invite and apply assigned role
- `handle_new_user()` -- trigger: auto-creates profile on signup

**Cart operations (shared user access):**
- `get_cart_items(cart_id)` -- fetch items with added_by email
- `get_cart_store_id(cart_id)` -- get cart's store
- `insert_cart_item(...)` -- add item to cart
- `update_cart_item(item_id, cart_id, updates)` -- update item
- `delete_cart_item(item_id, cart_id)` -- remove item
- `recalculate_cart_total(cart_id)` -- sum all items

**List operations (shared user access):**
- `get_list_by_id(list_id)` -- fetch list metadata
- `get_list_items(list_id)` -- fetch items with product info and added_by email
- `insert_list_item(...)` -- add item
- `update_list_item(item_id, list_id, updates)` -- update item
- `delete_list_item(item_id, list_id)` -- remove item
- `get_shared_lists_for_user()` -- lists shared with current user

**Tracking state:**
- `update_cart_tracking_list(cart_id, list_id)` -- set/clear tracking list (resets check state when clearing)
- `get_cart_tracking_list_id(cart_id)` -- get saved tracking list
- `get_tracking_check_state(cart_id)` -- load persisted check/uncheck state
- `update_tracking_check_state(cart_id, state)` -- save check/uncheck state

**Sharing (URL join):**
- `join_cart_by_url(cart_id)` -- auto-create cart_share for current user
- `join_list_by_url(list_id)` -- auto-create list_share for current user

### Row-Level Security (RLS)

All tables have RLS enabled. Key rules:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Own profile; admin sees all | Trigger-created | Own profile | -- |
| shopping_lists | Owner | Owner | Owner | Owner |
| shopping_list_items | Owner + shared members | Owner + shared members | Owner + shared members | Owner + shared members |
| shopping_carts | Owner | Owner | Owner | Owner |
| shopping_cart_items | Owner | Owner | Owner | Owner |
| products | All authenticated | All authenticated | Admin/moderator | Admin/moderator |
| stores | All authenticated | All authenticated | Admin/moderator | -- |
| cart_shares | Owner | Owner | -- | Owner |
| list_shares | Owner | Owner | -- | Owner |

> **Note:** Shared users access cart/list data through security definer RPCs, not directly through RLS policies.

## User Roles & Permissions

| Role | Can do |
|------|--------|
| **admin** | Everything: manage users, invites, stores, products, categories |
| **moderator** | Manage stores, products, categories |
| **user** | Use shopping carts, lists, products; share carts/lists |

New users must sign up with an invite code. The invite carries an `assigned_role` set by the admin who created it.

## Key Business Logic

### Cart Item Deduplication

When adding an item to a cart:
1. Look up by barcode (if scanned) -> find existing product
2. Check existing cart items for match: barcode > product_id > product_name (case-insensitive)
3. If match found: increment quantity on existing item
4. If new: insert new cart item

### Cart Finalization (Checkout)

1. Fetch all cart items
2. For each item without `product_id`: find or create product by barcode/name
3. Create `product_entry` for price history (only if cart has a store)
4. Set `finalized_at` timestamp
5. Recalculate total
6. Next visit creates a new active cart

### List Tracking on Cart

A shopping list can be attached to a cart to guide shopping:
1. Select a list -> items appear in a tracking panel
2. As cart items are added, they auto-match against list items (by product_id or name)
3. Multi-match: if one cart item matches 2+ list items, a modal lets the user pick which to mark
4. Manual check/uncheck: user can override auto-matching
5. Suppressed auto-match: user can reject a suggested match
6. All check state persists in `tracking_check_state` (JSONB on cart) -> survives page refresh
7. Check/uncheck broadcasts to shared users in real-time

### Sharing & Collaboration

- **Share by email:** Owner enters email; system looks up user via `get_profile_id_by_email` RPC. Unregistered emails are rejected.
- **Share by URL:** Anyone with the URL can join. The `join_cart_by_url` / `join_list_by_url` RPCs handle validation.
- **Shared user capabilities:** View items, add/edit/remove items, see the store (carts), see who added each item
- **Shared user restrictions:** Cannot delete the cart/list, cannot manage shares, cannot change the store (carts)
- **Real-time sync:** Items, tracking checks, and tracking list selection broadcast via Supabase channels
- **User avatars:** Each shared user gets a unique color (10-color palette, assigned per session)

### Discount Tracking

- Cart items can have `original_price` (pre-discount) and `price` (final)
- Discount modal: set discount as percentage or amount; changing original price keeps final price fixed
- Remove discount button clears the discount
- Discounts are saved to `product_entries` on checkout for historical tracking

## Project Structure

```
src/
  app/
    auth/login/          -- Login page
    auth/signup/         -- Signup with invite code
    auth/callback/       -- OAuth callback
    (protected)/         -- Auth-guarded layout
      shopping/          -- Active shopping cart
      lists/             -- Shopping lists
      lists/[id]/        -- List detail
      products/          -- Product catalog
      history/           -- Purchase history
      history/[id]/      -- Cart detail
      admin/             -- Admin panel (role-gated)
      shopping/join/[cartId]/   -- Join shared cart by URL
      lists/join/[listId]/      -- Join shared list by URL
    sw.ts                -- Service worker (Serwist)
    layout.tsx           -- Root layout
  features/
    shopping/            -- Cart actions, components (ShoppingPage, QuickAddForm, CartItemList, DiscountModal, ListTrackingPanel, BarcodeScanner)
    lists/               -- List actions, components (ListsPage, ListDetail)
    products/            -- Product actions, components (ProductSearch, AdminProductsPanel)
    history/             -- History actions, components (HistoryPage, CartDetailView, ImportReceiptModal)
    stores/              -- Store actions, components (StoreList)
    users/               -- User/invite actions, components (UserProvider, InviteForm, UserList)
    auth/                -- Auth actions, components (AuthForm)
  lib/
    supabase/server.ts   -- Server-side Supabase client (SSR, cookies)
    supabase/client.ts   -- Browser Supabase client (realtime, subscriptions)
    supabase/admin.ts    -- Service role client (admin operations)
    supabase/middleware.ts -- Session refresh middleware
    barcode-lookup.ts    -- Open Food Facts API integration
    ai/                  -- AI receipt scanning (Anthropic/OpenAI)
  components/
    layout/              -- Sidebar, BottomNav
    ui/                  -- ConfirmDialog, shared UI components
  types/
    database.ts          -- Supabase-generated types for all tables, views, and RPCs
  middleware.ts          -- Next.js middleware (session refresh)

supabase/
  schema.sql             -- Complete database DDL (tables, views, functions, triggers, RLS)
  migrations/            -- 19 incremental migration files + RUN_ALL_PENDING.sql
```

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anonymous key (public)
SUPABASE_SERVICE_ROLE_KEY=        # Service role key (server-only, for admin ops)
NEXT_PUBLIC_SITE_URL=             # App URL (for invite email redirects)
ANTHROPIC_API_KEY=                # (optional) Claude AI for receipt scanning
OPENAI_API_KEY=                   # (optional) OpenAI for receipt scanning
```

## Setup

### Prerequisites
- Node.js 20+
- Supabase project (cloud or self-hosted)

### Installation

```bash
npm install
```

### Database Setup

1. Create a Supabase project
2. Run `supabase/schema.sql` in the SQL Editor for a fresh install, OR run individual migrations from `supabase/migrations/`
3. For existing databases, run `supabase/migrations/RUN_ALL_PENDING.sql` which applies all migrations idempotently

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Migrations

Migration files are numbered sequentially in `supabase/migrations/`:

| # | File | Purpose |
|---|------|---------|
| 001 | roles_and_invites.sql | User roles, profiles table, invite system |
| 002 | invite_assigned_role.sql | Role assignment on invites |
| 003 | cart_finalized.sql | Finalized_at on carts |
| 004 | cart_receipt_images.sql | Receipt images table |
| 005a-c | Various | Direct price on items, is_active flags, store on carts |
| 006 | cart_product_name_and_shares.sql | Product name/barcode on cart items, cart_shares table |
| 007 | stores_sort_order.sql | Store ordering |
| 008 | list_shares_and_join_rpcs.sql | List sharing, URL join RPCs |
| 009-011 | Various | Original price (discount tracking) on items, entries, view |
| 012 | list_items_free_text.sql | Free-text list items (no product link) |
| 013 | products_delete_policy.sql | Admin product delete RLS |
| 014 | fix_handle_new_user_email.sql | Fix signup trigger email handling |
| 015-016 | Profile RPCs | Email/ID lookup functions |
| 017 | cart_shares_and_updated_rls.sql | Cart shares + RLS fixes |
| 018 | fix_all_rls_policies.sql | Dynamic drop/recreate all RLS policies |
| 019 | tracking_check_state.sql | Tracking list check state persistence |

`RUN_ALL_PENDING.sql` -- consolidated script that runs all migrations in one go (safe to re-run).

## Deployment

The app deploys to Vercel. Key considerations:
- Set all environment variables in Vercel project settings
- Run database migrations in Supabase SQL Editor before deploying new features
- The service worker (`sw.js`) is auto-generated by Serwist on build
