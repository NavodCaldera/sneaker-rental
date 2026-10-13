<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Nova Experience Culture & Agent Directives

## 1. Experience & Lifestyle First (Not a Technical Shoe Catalog)
- **Occasion-Led Discovery:** Instead of leading with sterile technical filters (brand, size), customers explore shoes through lifestyle moments and occasions:
  - *Endurance & Relentless Grit* (athletic endurance, tempos, race day)
  - *Executive Presence* (smart casual, office polish, urban transit)
  - *Clarity, Reset & Grounding* (effortless casual comfort, relaxed cafe terrace)
  - *Milestones & The Spotlight* (evening silhouettes, statement luxury)
  Occasion cards feature rich, authentic lifestyle photography with frosted glass icon pills and bold titles. Keep cards clean without cluttering taglines.
- **Curated Transformation Blueprints:** Merchants and admins create wardrobe rotations from real listed pairs (`/merchant/packs`, `/admin/packs`); a merchant's pack is published only after an admin approves it. Published packs (seeded examples: *The Marathon & Active Recovery*, *The All-Week Urban Wardrobe*, *The 24/7 City Explorer*) show on the home page and at `/packs/[id]`.
- **Occasion Concierge & Stylist Bar:** The homepage search pill is an aspirational concierge prompt rather than a technical database query:
  - *Prompt / Label:* "What room are you entering?"
  - *Placeholder:* "Tell Nova the presence you want to command..."
  - Submitting or clicking suggestion chips triggers the interactive **Nova Personal Stylist** drawer in the bottom-right corner, offering tailored shoe recommendations and instant rotation advice.
- **Experiential Listing & Shoe Storytelling:** On shoe detail pages (`/shoes/[id]`), shoes are presented as lifestyle stories rather than dry specs:
  - *Best Paired For (`ShoeBestPaired`):* Ideal occasions, terrain, and styling tips.
  - *The Shoe's Journey (`ShoeJourney`):* An authentic circular lifecycle celebrating shared luxury, circular rotation chapters, and diverted carbon footprint rather than mere "used" condition.
  - *Wear-Curve Value Barometer (`ShoeValueBarometer`):* An intuitive visual explaining how seasoned pairs deliver peak broken-in ergonomics and unmatched daily rent in their Golden Sweet Spot.

## 2. Wear-Sharing Engine & Virtual Rotating Wardrobe
- **Hold Any Number of Pairs:** A person can have any number of shoes at a time. Borrowers can hold and rent as many shoes as they desire simultaneously, with no artificial cap restricting their active rotation.
- **Wear-Sharing Advantage:** Daily wear is divided 1/n across all pairs held (n). Holding multiple pairs splits wear, so rotating through a multi-pair wardrobe costs about the same daily rent as keeping a single pair.
- **Shift from Cart to "Your Nova Closet":** Rather than a transactional "add to cart" checkout, borrowers curate their rotation in an interactive wardrobe rack with lifestyle rotation slots (*Morning Run*, *Work Day*, *Weekend Stroll*, *Night Out*; kids: *School Day*, *Sports Day*, *Playtime*, *Party Time*, the same names as the experience filters) and expandable slots for any number of pairs, reinforcing that a person can hold and rotate any number of shoes at a time.
- **Rotation Simulator:** An interactive widget on the homepage where customers drag & drop or tap pairs into their rotation to visualize how daily wear-sharing optimizes cost. The simulator updates in real time to show total retail value unlocked versus combined daily rent, demonstrating that an entire multi-pair luxury wardrobe is accessible for virtually the daily price of a single pair.

## 3. Brand Voice & Customer-Centric Copy
- **Browse Header:** "Elevate Your Everyday" (concise, inspiring; avoid long technical subtitles).
- **Discount Messaging:** the first home row is titled "Accelerate Your Stride" (formerly "Exceptional Value"), with no subtitle.
- **Customer Terminology:** Always write "per day" (prices) and "days" (counts, lifespans). Never show internal terms like "wear-day" to users. UI text refers to "shoes", never "sneakers".
- **Card Minimalism:** Browse and listing cards show only essential attributes: Photo, Model Name (or brand + model via `shoeName()`), one Size, Rent Price per day, and Condition. Avoid cluttering cards with availability flags or extra tags.
- **Uniform Badge Sizing:** Badges (such as `DiscountBadge`) use uniform sizing (`80px` × `24px`, `w-20 h-6`) with centered text.

## 4. Visual Aesthetics & Design System
- **Logo:** The brand wordmark "Nova" in signature theme accent blue (`text-accent`, `#35D6ED`) serves as the logo (no colored box icon in the navigation bar).
- **Palette:** Pure white (`#FFFFFF`), pure black (`#000000`), and signature cyan accent (`#35D6ED`).
- **Contrast Rules:** Black text on cyan accent (`text-on-accent`) for buttons/pills; the brand wordmark "Nova" uses `text-accent`.
- **Day and Night Mode:** All colors use `light-dark()` tokens in `globals.css` with persistent theme switching.
- **Photography:** Always use authentic, high-resolution lifestyle photography (no generic placeholders).

## 5. Transformation Economy & Personal Profile
- **Each account is one person (product owner, 2026-10-13):** customers answer **"Whom do you want to become?"** at sign-up in their own words, in a description box: the personality they want to have and how people should see them (our example: *"I want to build Sri Lanka's largest tech sensation"*). Nova reads personas from the words (`personasFromStory` in `src/lib/borrower-profile.ts`). They also give their gender, date of birth and shoe size. They can change it on `/account`.
- **Shoes for the person:** Browse, the home rows and the Closet always use their size (no size or gender picker anywhere; they change the size on their account page), for them; Browse and the Closet need an account (Men or Women; Boys or Girls under 13), with pairs made for who they want to become first. The profile never changes a price, except the birthday month's free rent (pricing-spec.md §8a).
- **We value your celebrations (product owner, 2026-10-13):** in a customer's birthday month, rent is on us for up to 4 pairs (pricing-spec.md §8a). Say so where we ask for the date of birth, so customers know why we ask and that it stays private.
