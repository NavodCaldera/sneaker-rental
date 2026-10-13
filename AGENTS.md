<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Nova Experience Culture & Agent Directives

## 1. Experience & Lifestyle First (Not a Technical Shoe Catalog)
- **Occasion-Led Discovery:** Instead of leading with sterile technical filters (brand, size), customers explore shoes through lifestyle moments and occasions:
  - *Morning Run & Performance* (athletic endurance, tempos, race day)
  - *The Daily Commute & Work Day* (smart casual, office polish, urban transit)
  - *Weekend Stroll & Brunch* (effortless casual comfort, relaxed cafe terrace)
  - *Night Out & Big Occasions* (evening silhouettes, statement luxury)
  Occasion cards feature rich, authentic lifestyle photography with frosted glass icon pills and bold titles. Keep cards clean without cluttering taglines.
- **Curated Rotations & Style Packs:** Merchants and admins create wardrobe rotations from real listed pairs (`/merchant/packs`, `/admin/packs`); a merchant's pack is published only after an admin approves it. Published packs (seeded examples: *The Marathon & Active Recovery*, *The All-Week Urban Wardrobe*, *The 24/7 City Explorer*) show on the home page and at `/packs/[id]`.

## 2. Wear-Sharing Engine & Unlimited Pairs
- **Hold Any Number of Pairs:** Borrowers can hold and rent as many shoes as they desire simultaneously. There is no artificial cap (such as 4 pairs) restricting their active rotation.
- **Wear-Sharing Advantage:** Daily wear is divided 1/n across all pairs held (n). Holding multiple pairs splits wear, so rotating through a multi-pair wardrobe costs about the same daily rent as keeping a single pair.

## 3. Brand Voice & Customer-Centric Copy
- **Browse Header:** "Elevate Your Everyday" (concise, inspiring; avoid long technical subtitles).
- **Discount Messaging:** "Unmatched Value, From Day One" (formerly "Exceptional Value").
- **Customer Terminology:** Always write "per day" (prices) and "days" (counts, lifespans). Never show internal terms like "wear-day" to users. UI text refers to "shoes", never "sneakers".
- **Card Minimalism:** Browse and listing cards show only essential attributes: Photo, Model Name (or brand + model via `shoeName()`), one Size, Rent Price per day, and Condition. Avoid cluttering cards with availability flags or extra tags.
- **Uniform Badge Sizing:** Badges (such as `DiscountBadge`) use uniform sizing (`80px` × `24px`, `w-20 h-6`) with centered text.

## 4. Visual Aesthetics & Design System
- **Palette:** Pure white (`#FFFFFF`), pure black (`#000000`), and signature cyan accent (`#35D6ED`).
- **Contrast Rules:** Black text on cyan accent (`text-on-accent`). Never cyan text on white.
- **Day and Night Mode:** All colors use `light-dark()` tokens in `globals.css` with persistent theme switching.
- **Photography:** Always use authentic, high-resolution lifestyle photography (no generic placeholders).

## 5. Transformation Economy & Personal Profile
- **Each account is one person (product owner, 2026-10-13):** customers answer **"Whom do you want to become?"** at sign-up (The Athlete, The Professional, The Explorer, The Creative, The Icon; one or more, `PERSONAS` in `src/lib/borrower-profile.ts`), plus their gender, date of birth and shoe size. They can change it on `/account`.
- **Shoes for the person:** Browse and the Closet start in their size, for them (Men or Women; Boys or Girls under 13), with pairs made for who they want to become first. "Show all shoes" lifts it. The profile never changes a price.
