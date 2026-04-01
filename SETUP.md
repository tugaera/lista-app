# Meu Cesto - Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Anon Key** from Settings → API

### Run Schema
1. Open the SQL Editor in your Supabase dashboard
2. First, enable the trigram extension for fuzzy search:
   ```sql
   create extension if not exists pg_trgm;
   ```
3. Copy and paste the contents of `supabase/schema.sql` and execute it

### Configure Storage
1. Go to Storage in your Supabase dashboard
2. Create a new bucket called `receipts`
3. Set it to **public** (for receipt image URLs)
4. Add a storage policy allowing authenticated users to upload:
   ```sql
   create policy "authenticated uploads" on storage.objects
     for insert to authenticated
     with check (bucket_id = 'receipts');

   create policy "public reads" on storage.objects
     for select using (bucket_id = 'receipts');
   ```

### Configure Auth
1. Go to Authentication → Settings
2. Enable Email/Password sign-up
3. Set Site URL to `http://localhost:3000`
4. Add `http://localhost:3000/auth/callback` to Redirect URLs

## 2. Local Setup

```bash
# Clone and install
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL and Anon Key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 3. Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (protected)/        # Auth-required routes
│   │   ├── shopping/       # Shopping mode
│   │   ├── lists/          # Shopping lists
│   │   ├── products/       # Product catalog
│   │   └── history/        # Purchase history
│   └── auth/               # Login/signup
├── components/
│   ├── ui/                 # Reusable UI components
│   └── layout/             # Navigation, sidebar
├── features/
│   ├── auth/               # Auth actions & components
│   ├── shopping/           # Shopping cart logic
│   ├── lists/              # Shopping list logic
│   ├── products/           # Product management
│   └── history/            # History & analytics
├── hooks/                  # Custom React hooks
├── lib/
│   ├── supabase/           # Supabase client setup
│   ├── offline/            # IndexedDB + sync
│   └── services/           # OCR, external services
└── types/                  # TypeScript definitions
```

## Key Design Decisions

- **Price History**: Prices are NEVER updated in-place. Every price observation creates a new `product_entries` row, maintaining full history.
- **Offline-First**: Shopping mode works offline via IndexedDB. Mutations queue locally and sync when connectivity returns.
- **RLS**: All user data is protected by Row Level Security. Users can only access their own carts and lists.
- **Server Actions**: All mutations go through Next.js Server Actions for security.
