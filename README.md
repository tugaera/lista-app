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

- **Shopping Cart** — add products by name or barcode scan, track prices, apply discounts, finalize to history
- **Shopping Lists** — plan purchases, link products or add free-text items, track quantities
- **Real-time Collaboration** — share carts and lists with other users; items sync instantly via Supabase Realtime broadcast
- **List Tracking on Cart** — attach a shopping list to a cart to see what still needs to be bought, with auto-matching and manual check/uncheck; check state persists across refreshes for all participants
- **Price History** — every finalized purchase creates an append-only price entry; view trends per product per store
- **Barcode Scanning** — scan barcodes to look up products (local DB + Open Food Facts API)
- **Discount Tracking** — original price vs final price, percentage/amount calculation
- **Role-based Access** — admin, moderator, user roles with invite-code signup
- **PWA / Offline** — installable app, offline page caching, queued mutations sync on reconnect
- **Receipt Upload** — attach photos to cart history; optional AI-powered receipt OCR
- **Cart Switcher** — switch between your own cart and carts shared with you; leave shared carts

---

## Architecture Overview

```
Browser (React 19)
  |
  |-- Server Components  (SSR, initial data fetching)
  |-- Server Actions     (mutations, business logic)
  |-- Client Components  (interactivity, realtime subscriptions)
  |
Supabase
  |-- PostgreSQL         (tables, views, RLS, security definer functions)
  |-- Auth               (email/password, invite codes)
  |-- Realtime           (broadcast channels for shared carts/lists)
  |-- Storage            (receipt images in private bucket)
```

### Data Access Pattern

Direct Supabase queries work for data the current user **owns**. For **shared** data (carts or lists shared with another user), RLS blocks direct queries and returns empty arrays silently — never an error. The app uses **security definer RPC functions** that bypass RLS while performing their own access checks internally.

Standard pattern throughout the codebase:
1. Try direct query first (fast path — works for owners)
2. If result is empty/null and user may be a shared member, fall back to the appropriate security definer RPC

---

## Database Schema

### Entity Relationships

```
auth.users (1) ---- (1) profiles
profiles   (1) ---- (*) invites            invited by admin
profiles   (1) ---- (*) shopping_lists     user owns lists
profiles   (1) ---- (*) shopping_carts     user owns carts

shopping_lists  (1) ---- (*) shopping_list_items
shopping_lists  (1) ---- (*) list_shares
shopping_lists  (*) ---0 (1) shopping_carts    via tracking_list_id

shopping_carts  (1) ---- (*) shopping_cart_items
shopping_carts  (1) ---- (*) cart_shares
shopping_carts  (1) ---- (*) cart_receipt_images
shopping_carts  (*) ---- (1) stores             store_id (nullable)

products  (1) ---- (*) product_entries    price history (append-only)
products  (1) ---0 (*) shopping_cart_items
products  (1) ---0 (*) shopping_list_items

stores      (1) ---- (*) product_entries
categories  (1) ---0 (*) products
```

### Tables

#### `profiles`
Extends `auth.users`. Auto-created by the `handle_new_user` trigger on signup.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | matches auth.users(id), cascade delete |
| email | text NOT NULL UNIQUE | |
| role | enum (admin, moderator, user) | default: user |
| invited_by | uuid FK → profiles(id) | nullable |
| created_at | timestamptz | |

#### `invites`
Controls who can register. Each invite carries the role the new user will receive.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | text UNIQUE | 8-character code |
| created_by | uuid FK → profiles(id) NOT NULL | |
| assigned_role | enum (admin, moderator, user) | default: user |
| used_by | uuid FK → profiles(id) | nullable |
| used_at | timestamptz | nullable |
| expires_at | timestamptz NOT NULL | |
| created_at | timestamptz | |

#### `stores`
Physical supermarkets/shops.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text UNIQUE | |
| is_active | boolean | default: true (soft delete) |
| sort_order | integer | nullable; null sorts after numbered stores |
| created_at | timestamptz | |

#### `categories`
Product categories (informational only).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text UNIQUE | |
| created_at | timestamptz | |

#### `products`
Master product catalog. Never deleted — use `is_active = false` to hide.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| barcode | text UNIQUE | nullable |
| category_id | uuid FK → categories(id) | nullable |
| is_active | boolean | default: true |
| created_at | timestamptz | |

Indexes: GIN trigram on `name` (fuzzy search), btree on `barcode`, btree on `category_id`.

#### `product_entries`
Append-only price history. Never updated; one row per purchase event.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product_id | uuid FK → products(id) NOT NULL | |
| store_id | uuid FK → stores(id) NOT NULL | |
| price | numeric(10,2) ≥ 0 NOT NULL | final/discounted price |
| original_price | numeric(10,2) | nullable; pre-discount price |
| quantity | numeric(10,3) > 0 | default: 1; unit size e.g. "500g" |
| created_at | timestamptz | |

#### `shopping_lists`
User's planning/pre-shopping lists.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → auth.users(id) NOT NULL cascade | |
| name | text | |
| created_at | timestamptz | |

#### `shopping_list_items`
Items inside a planning list. Product link is optional — items can be free text.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| list_id | uuid FK → shopping_lists(id) NOT NULL cascade | |
| product_id | uuid FK → products(id) | nullable (cascade delete) |
| product_name | text | nullable; used when no product_id |
| planned_quantity | numeric(10,3) > 0 | default: 1 |
| added_by | uuid FK → auth.users(id) | nullable; tracks who added the item |
| created_at | timestamptz | |

#### `shopping_carts`
One active cart per user at a time (`finalized_at IS NULL`). Finalized carts become history.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → auth.users(id) NOT NULL cascade | |
| store_id | uuid FK → stores(id) | nullable |
| tracking_list_id | uuid FK → shopping_lists(id) | nullable; on delete set null |
| tracking_check_state | jsonb | default: `{}`; persists manual check/uncheck state |
| total | numeric(10,2) | default: 0; recalculated on every item change |
| receipt_image_url | text | nullable; legacy single-image field |
| finalized_at | timestamptz | nullable; null = active cart |
| created_at | timestamptz | |

`tracking_check_state` JSONB shape:
```json
{
  "manuallyChecked": ["list-item-uuid", ...],
  "suppressedAutoMatch": ["list-item-uuid", ...]
}
```

#### `shopping_cart_items`
Items currently in a cart. Price is stored at add time (not linked to product_entries until checkout).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cart_id | uuid FK → shopping_carts(id) NOT NULL cascade | |
| product_id | uuid FK → products(id) | nullable |
| product_entry_id | uuid FK → product_entries(id) | nullable; set null on delete |
| product_name | text NOT NULL | user-entered or resolved from barcode |
| product_barcode | text | nullable |
| price | numeric(10,2) NOT NULL | final price at time of adding |
| original_price | numeric(10,2) | nullable; pre-discount price |
| quantity | numeric(10,3) > 0 | default: 1 |
| added_by | uuid FK → auth.users(id) | nullable; tracks who added the item |
| created_at | timestamptz | |

#### `cart_shares`
Grants another user access to a cart. Only the cart owner can create/delete shares. Shared users must use RPCs to mutate data.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cart_id | uuid FK → shopping_carts(id) NOT NULL cascade | |
| owner_id | uuid FK → auth.users(id) NOT NULL | |
| shared_with_email | text | email at time of sharing |
| shared_with_user_id | uuid FK → auth.users(id) | nullable; set on successful lookup |
| created_at | timestamptz | |

Unique constraint: `(cart_id, shared_with_email)`.

#### `list_shares`
Grants another user access to a shopping list. Same pattern as cart_shares.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| list_id | uuid FK → shopping_lists(id) NOT NULL cascade | |
| owner_id | uuid FK → auth.users(id) NOT NULL cascade | |
| shared_with_email | text | |
| shared_with_user_id | uuid FK → auth.users(id) | nullable; set null on delete |
| created_at | timestamptz | |

Unique constraint: `(list_id, shared_with_email)`.

#### `cart_receipt_images`
Multiple receipt photos per cart.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| cart_id | uuid FK → shopping_carts(id) NOT NULL cascade | |
| image_url | text | |
| sort_order | integer | default: 0 |
| created_at | timestamptz | |

---

### Views

#### `latest_product_prices`
Shows the most recent price entry per product per store. Used for search results, product listings, and price comparisons.

Columns: `id, product_id, store_id, price, original_price, quantity, created_at, product_name, barcode, store_name`

---

### Row-Level Security (RLS)

All tables have RLS enabled. The following policies are enforced:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | Own row only; admin sees all | Trigger only | Own row | — |
| `invites` | Creator sees own; admin sees all | Admin/moderator | — | Creator (unused only) |
| `stores` | All authenticated | All authenticated | Admin/moderator | — |
| `categories` | All authenticated | All authenticated | Admin/moderator | — |
| `products` | All authenticated | All authenticated | Admin/moderator | Admin/moderator |
| `product_entries` | All authenticated | All authenticated | — | — |
| `shopping_lists` | Owner only | Owner only | Owner only | Owner only |
| `shopping_list_items` | Owner + list shared members | Owner + list shared members | Owner + list shared members | Owner + list shared members |
| `shopping_carts` | Owner only | Owner only | Owner only | Owner only |
| `shopping_cart_items` | Owner only | Owner only | Owner only | Owner only |
| `cart_shares` | Owner only | Owner only | — | Owner only |
| `list_shares` | Owner only | Owner only | — | Owner only |
| `cart_receipt_images` | Owner only | Owner only | — | Owner only |

> **Critical:** RLS returns an **empty array** (not an error) when access is denied on SELECT. Code must not treat an empty result as "no data" — it may mean "access denied". This is why shared users always go through security definer RPCs instead of direct queries.

---

### Security Definer Functions (RPCs)

All functions run as the database owner, bypassing RLS. Each performs its own access check before acting.

#### Profile & Auth
| Function | Returns | Purpose |
|----------|---------|---------|
| `get_my_role()` | text | Current user's role (admin/moderator/user) |
| `get_profile_id_by_email(email)` | uuid | Look up any user's ID by email (used for sharing) |
| `get_profile_email_by_id(user_id)` | text | Look up any user's email by ID (used for display) |
| `validate_invite_code(code)` | boolean | Check invite validity — callable by anonymous users |
| `consume_invite(code, user_id)` | boolean | Mark invite used and apply assigned role to profile |
| `handle_new_user()` | trigger | Auto-creates profile row when auth.users row is inserted |

#### Cart Data (shared user access)
| Function | Returns | Purpose |
|----------|---------|---------|
| `get_cart_items(cart_id)` | jsonb | Fetch all cart items with `added_by_email` |
| `get_cart_store_id(cart_id)` | uuid | Get cart's selected store |
| `insert_cart_item(cart_id, product_id, product_name, barcode, price, original_price, quantity, added_by)` | uuid | Add item to cart |
| `update_cart_item(item_id, cart_id, updates)` | void | Update item fields |
| `delete_cart_item(item_id, cart_id)` | void | Remove item |
| `recalculate_cart_total(cart_id)` | void | Recompute and save total |
| `get_shared_carts_for_user()` | jsonb | All non-finalized carts shared with current user (joins cart_shares + shopping_carts, bypasses owner-only RLS) |
| `leave_shared_cart(cart_id)` | void | Delete current user's own cart_share row (RLS only allows owner to delete) |

#### List Data (shared user access)
| Function | Returns | Purpose |
|----------|---------|---------|
| `get_list_by_id(list_id)` | jsonb | Fetch list metadata — access granted if: owner, list_shares member, or the list is a tracking_list_id on a cart shared with the user |
| `get_list_items(list_id)` | jsonb | Fetch list items with product info and `added_by_email` — same access check as above |
| `insert_list_item(list_id, product_id, product_name, planned_qty, added_by)` | uuid | Add item |
| `update_list_item(item_id, list_id, updates)` | void | Update item |
| `delete_list_item(item_id, list_id)` | void | Remove item |
| `get_shared_lists_for_user()` | jsonb | All lists shared with current user |

#### Tracking State
| Function | Returns | Purpose |
|----------|---------|---------|
| `update_cart_tracking_list(cart_id, list_id)` | void | Set or clear the tracking list; clears `tracking_check_state` when list_id is null |
| `get_cart_tracking_list_id(cart_id)` | uuid | Get saved tracking list ID |
| `get_tracking_check_state(cart_id)` | jsonb | Load persisted `{manuallyChecked, suppressedAutoMatch}` state |
| `update_tracking_check_state(cart_id, state)` | void | Save check state (debounced, 500ms) |

#### URL-based Sharing (join)
| Function | Returns | Purpose |
|----------|---------|---------|
| `join_cart_by_url(cart_id)` | jsonb | Create cart_share for current user from URL link |
| `join_list_by_url(list_id)` | jsonb | Create list_share for current user from URL link |

---

## User Roles & Permissions

| Role | Capabilities |
|------|-------------|
| **admin** | Full access: manage users, create/delete invites with any role, manage stores, products, categories; all user capabilities |
| **moderator** | Manage stores, products, categories; all user capabilities |
| **user** | Use shopping carts and lists, share carts/lists with others, view products and price history |

New users must sign up with a valid invite code. The invite has an `assigned_role` set by the admin at creation time. Unregistered emails are rejected when sharing.

---

## Key Business Logic

### Cart Item Deduplication

When adding an item to a cart (owner or shared user):
1. Look up product by barcode (if scanned) → resolve `product_id`
2. Fetch existing cart items via `get_cart_items` RPC
3. Match by priority: barcode match → product_id match → product_name match (case-insensitive)
4. If match found: increment quantity on the existing item
5. If no match: insert new item via `insert_cart_item` RPC
6. Recalculate cart total

### Cart Finalization (Checkout)

Only the cart owner can check out. Steps:
1. Fetch all cart items
2. For each item without `product_id`: find existing product by barcode/name, or create a new one
3. If cart has a `store_id`: create a `product_entry` row for each item (price history record)
4. Update each cart item's `product_id`
5. Set `finalized_at` timestamp
6. Recalculate total
7. The cart moves to history. Next visit to `/shopping` auto-creates a fresh active cart.
8. All shared users can view the finalized cart in their history.

### List Tracking on Cart

Any user (owner or shared) can attach a shopping list — including lists shared with them — to a cart:

1. Open the list picker; shows owned lists + shared lists (marked with a purple "shared" badge)
2. Selecting a list saves `tracking_list_id` on the cart via RPC (persists for all participants)
3. A tracking panel appears showing items as matched (green ✓) or unmatched (circle)
4. **Auto-match:** as cart items are added, list items are matched by `product_id` or name substring
5. **Multi-match modal:** if one cart item matches 2+ list items, a modal lets the user choose which to mark; unselected items are added to `suppressedAutoMatch` to prevent re-matching
6. **Manual check/uncheck:** any matched item can be unchecked; any unchecked item can be manually checked
7. **Persistence:** all check decisions save to `tracking_check_state` JSONB on the cart (debounced 500ms) — survives page refresh for all participants
8. **Real-time sync:** check/uncheck events broadcast to all participants via Supabase channel

### Sharing & Collaboration

**Share by email:**
- Owner enters a registered email address
- `get_profile_id_by_email` RPC looks up the user (bypasses RLS on profiles)
- Unregistered emails are rejected with an error
- Creates a `cart_shares` / `list_shares` row

**Share by URL:**
- Owner copies the share URL from the share panel
- Any registered user who opens the URL triggers `join_cart_by_url` / `join_list_by_url`
- The RPC validates and creates the share row

**Shared user capabilities:**
- View all items, add/edit/remove items (via RPCs)
- See the store selected by the owner (read-only)
- See who added each item (colored avatar with email tooltip)
- Attach and interact with a tracking list (including shared lists)
- See finalized cart in their history after owner checkout

**Shared user restrictions:**
- Cannot delete the cart or list
- Cannot manage shares (add/remove members)
- Cannot change the store on a shared cart
- Cannot check out (only owner can finalize)

**Cart switcher:**
- Available in the share panel under "Carts shared with me"
- Shows all non-finalized carts shared with the current user
- Click "Open" to switch to a shared cart
- Click "Leave" to remove yourself from the share (confirmation modal; uses `leave_shared_cart` RPC to bypass RLS)

**Real-time sync (Supabase Realtime broadcast):**
- Cart items: insert, update, delete events broadcast on channel `cart-sync-{cartId}`
- List items: insert, update, delete events broadcast on channel `list-sync-{listId}`
- Tracking list change: broadcasted when owner picks or clears the tracking list
- Tracking check/uncheck: broadcasted on every manual check/uncheck
- User avatars: 10-color palette, colors assigned per-session in order of appearance (not stored in DB)

### Discount Tracking

- Cart items have `price` (final) and `original_price` (pre-discount, nullable)
- Discount modal: enter discount as percentage or fixed amount
- Changing original price recalculates discount/amount while keeping final price fixed
- "Remove Discount" clears `original_price` and sets both values equal
- On checkout, `original_price` is saved to `product_entries` for historical tracking

### Product Search

- Searches `latest_product_prices` view (has price data) AND `products` table directly (for products without price history yet)
- Results deduplicated by `product_id`
- Fuzzy matching using PostgreSQL trigram index on product name

---

## Project Structure

```
src/
  app/
    auth/
      login/              Login page
      signup/             Signup with invite code (?code= param)
      callback/           Supabase auth callback
    (protected)/          Auth-guarded layout (Sidebar + BottomNav + UserProvider)
      shopping/           Active shopping cart page
      shopping/join/[cartId]/   Join shared cart by URL
      lists/              Shopping lists directory
      lists/[id]/         List detail (add/edit items, sharing)
      lists/join/[listId]/      Join shared list by URL
      products/           Product catalog (search, price history)
      history/            Purchase history (finalized carts)
      history/[id]/       Cart detail view
      admin/              Admin panel (users, invites, stores, products)
    sw.ts                 Service worker entry point (Serwist)
    layout.tsx            Root layout

  features/
    shopping/
      actions.ts          Cart CRUD: add/remove/update items, finalize, deduplication
      actions-shares.ts   Cart sharing: share, revoke, leave, join, get shared carts
      actions-receipt.ts  Receipt image upload/management
      components/
        shopping-page.tsx       Main cart UI (realtime, tracking, sharing, cart switcher)
        cart-item-list.tsx      List of cart items with discount modal trigger
        quick-add-form.tsx      Add item form (barcode scan + text input)
        discount-modal.tsx      Discount calculation modal
        list-tracking-panel.tsx Tracking panel (matched/unmatched items, multi-match modal)
        barcode-scanner.tsx     Camera barcode scanner

    lists/
      actions.ts          List CRUD: create/delete lists, add/remove/update items
                          getListsPreview returns owned + shared lists for tracking picker
      actions-shares.ts   List sharing: share, revoke, leave, join, get shared lists
      components/
        lists-page.tsx    Lists directory (owned + shared)
        list-detail.tsx   List detail with realtime collab and sharing panel

    products/
      actions.ts          Search, price history, admin CRUD, barcode lookup
      components/
        product-search.tsx       Search with price display
        admin-products-panel.tsx Admin CRUD with dependency check before delete

    history/
      actions.ts          Fetch finalized carts (own + shared), cart detail, price history
      actions-import.ts   AI receipt import logic
      actions-receipts.ts Receipt image storage management
      components/
        history-page.tsx        History list
        cart-detail-view.tsx    Finalized cart detail with receipt images
        import-receipt-modal.tsx AI-powered receipt OCR import

    stores/
      actions.ts          Store CRUD (name, is_active, sort_order)
      components/
        store-list.tsx    Admin store management

    users/
      actions.ts          User management, invite creation/deletion, role changes
      components/
        user-provider.tsx  React context for current auth user
        invite-form.tsx    Create invite with email + role
        invite-list.tsx    List and delete invites
        user-list.tsx      All users with role display

    auth/
      actions.ts          Login, signup with invite validation
      components/
        auth-form.tsx     Login/signup form

  lib/
    supabase/
      server.ts           SSR Supabase client (reads/writes cookies, server components + actions)
      client.ts           Browser Supabase client (realtime subscriptions)
      admin.ts            Service role client (bypasses RLS for admin ops + auth emails)
      middleware.ts       Session token refresh on every request
    barcode-lookup.ts     Open Food Facts API lookup for unknown barcodes
    ai/
      anthropic.ts        Claude-based receipt OCR
      openai.ts           OpenAI-based receipt OCR
      index.ts            Provider selection (prefers Anthropic, falls back to OpenAI)
      types.ts            Shared AI response types
    user-colors.ts        10-color palette for shared user avatars

  components/
    layout/
      sidebar.tsx         Desktop sidebar navigation
      bottom-nav.tsx      Mobile bottom navigation (hides admin tab for regular users)
    ui/
      confirm-dialog.tsx  Reusable confirmation dialog

  types/
    database.ts           Full Supabase TypeScript types for all tables, views, and RPCs

  middleware.ts           Next.js middleware — refreshes session on every request

supabase/
  schema.sql              Complete DDL: all tables, views, functions, triggers, RLS policies
  migrations/             Incremental migration files
    RUN_ALL_PENDING.sql   Consolidated script — run this in Supabase SQL Editor to apply everything
```

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anonymous/public key
SUPABASE_SERVICE_ROLE_KEY=        # Service role key — server only, never expose to browser
NEXT_PUBLIC_SITE_URL=             # App URL (used in invite email redirect links)
ANTHROPIC_API_KEY=                # (optional) Claude AI for receipt OCR
OPENAI_API_KEY=                   # (optional) OpenAI for receipt OCR (fallback)
```

---

## Setup

### Prerequisites
- Node.js 20+
- Supabase project (cloud or local via Supabase CLI)

### Installation

```bash
npm install
```

### Database Setup

**Fresh install:**
```sql
-- Run in Supabase SQL Editor
-- Paste contents of supabase/schema.sql
```

**Existing database (apply pending migrations):**
```sql
-- Run in Supabase SQL Editor
-- Paste contents of supabase/migrations/RUN_ALL_PENDING.sql
```

`RUN_ALL_PENDING.sql` is idempotent — safe to re-run. It uses `IF NOT EXISTS`, `CREATE OR REPLACE`, and dynamic policy drops.

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

---

## Database Migrations

| # | File | What it does |
|---|------|-------------|
| 001 | `roles_and_invites.sql` | Role enum, profiles table, invite system, handle_new_user trigger |
| 002 | `invite_assigned_role.sql` | Add assigned_role to invites |
| 003 | `cart_finalized.sql` | Add finalized_at to shopping_carts |
| 004 | `cart_receipt_images.sql` | cart_receipt_images table |
| 005a | `cart_items_direct_price.sql` | Price stored directly on cart items (not via product_entries) |
| 005b | `products_active_cart_store.sql` | is_active on products, store_id on carts |
| 005c | `stores_is_active.sql` | is_active on stores |
| 006 | `cart_product_name_and_shares.sql` | product_name/barcode on cart items, cart_shares table |
| 007 | `stores_sort_order.sql` | sort_order on stores |
| 008 | `list_shares_and_join_rpcs.sql` | list_shares table, join_cart_by_url and join_list_by_url RPCs |
| 009 | `cart_items_original_price.sql` | original_price on shopping_cart_items |
| 010 | `product_entries_original_price.sql` | original_price on product_entries |
| 011 | `view_original_price.sql` | Rebuild latest_product_prices view with original_price |
| 012 | `list_items_free_text.sql` | product_id nullable on shopping_list_items, add product_name |
| 013 | `products_delete_policy.sql` | RLS DELETE policy for admin/moderator on products |
| 014 | `fix_handle_new_user_email.sql` | Fix trigger to use COALESCE(NEW.email, raw_user_meta_data->>'email') |
| 015 | `get_profile_id_by_email.sql` | Security definer RPC for profile lookup by email |
| 016 | `get_profile_email_by_id.sql` | Security definer RPC for profile email by ID |
| 017 | `cart_shares_and_updated_rls.sql` | Ensure cart_shares exists, fix RLS policies |
| 018 | `fix_all_rls_policies.sql` | Dynamic drop+recreate of all RLS policies (handles name mismatches in live DB) |
| 019 | `tracking_check_state.sql` | tracking_check_state column, get/update_tracking_check_state RPCs, leave_shared_cart RPC, get_shared_carts_for_user RPC |

---

## Deployment

The app is deployed to Vercel.

- Set all environment variables in Vercel project settings
- Run `RUN_ALL_PENDING.sql` in the Supabase SQL Editor **before** deploying code that requires new DB objects
- The service worker (`/sw.js`) is auto-generated by Serwist at build time
- Storage bucket for receipts must be set to **private** in Supabase
