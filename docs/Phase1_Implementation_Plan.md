# Phase 1 Implementation Plan

Marketing Site -- NexusBridge Lending LLC

---

## 1. Phase Overview & Goals

### Goals

Phase 1 delivers the public-facing marketing site for NexusBridge Lending LLC, establishing the company's digital presence and beginning borrower lead generation. The site communicates the company's lending products, captures prospective borrower inquiries, and routes them to the appropriate internal team via email.

1. **Brand establishment** -- present NexusBridge Lending as a credible, professional private lending company specializing in short-term asset-backed financing
2. **Lead generation** -- capture prospective borrower contact information and loan inquiries through strategically placed forms and CTAs
3. **Product education** -- clearly explain each lending product (Bridge Loans, Fix & Flip, GAP Funding, Micro-Lending) with terms, use cases, and qualification criteria
4. **Entity separation** -- ensure the NexusBridge site only displays debt products; no equity investment products, no CEM branding beyond the required footer reference

### What success looks like

- All 8 pages live on Vercel with custom domain (nexusbridgelending.com)
- Contact form submissions routed to appropriate team via Resend email
- Google Lighthouse performance score > 90 on all pages
- Mobile-responsive across all breakpoints
- SEO metadata, Open Graph tags, and sitemap in place
- Zero equity/CEM product references in site content (entity separation enforced)

### Status: ✅ Complete

The marketing site is live on Vercel. All pages, forms, and email routing are functional.

### Connection to Phase 2

Phase 1 is a standalone marketing site with no authentication or database. Phase 2 introduces:
- Supabase Auth for the unified portal (`apps/portal`)
- The "Apply Now" CTA on the marketing site links to the portal's borrower application flow
- The marketing site footer links to the portal login page

---

## 2. Pages & Routes

### Site map

| Route | Page | Purpose |
|---|---|---|
| `/` | Home | Hero section, value proposition, product overview cards, social proof, CTA |
| `/about` | About | Company story, team, mission, NexusBridge + CEM relationship (cross-reference only) |
| `/services` | Services Hub | Overview of all four lending products with links to individual product pages |
| `/services/bridge-loans` | Bridge Loans | Product detail: terms, LTV ratios, use cases, qualification criteria |
| `/services/fix-and-flip` | Fix & Flip | Product detail: renovation financing, draw schedule, ARV-based lending |
| `/services/gap-funding` | GAP Funding | Product detail: gap financing for real estate transactions |
| `/services/micro-lending` | Micro-Lending | Product detail: small-balance asset-backed loans |
| `/blog` | Blog | Content marketing hub (static articles, no CMS) |
| `/contact` | Contact | Contact form with inquiry type selector, office information, map |
| `/apply` | Apply Now | Redirect or CTA pointing to the portal borrower application (Phase 2+) |

### Page architecture

All pages use the Next.js App Router with server-side rendering (SSR) or static generation (SSG) where appropriate. No client-side data fetching is needed -- the marketing site is content-only.

```
apps/web-marketing/src/app/
├── layout.tsx           # Root layout: header, footer, metadata
├── page.tsx             # Home
├── about/page.tsx
├── services/
│   ├── page.tsx         # Services hub
│   ├── bridge-loans/page.tsx
│   ├── fix-and-flip/page.tsx
│   ├── gap-funding/page.tsx
│   └── micro-lending/page.tsx
├── blog/page.tsx
├── contact/page.tsx
├── apply/page.tsx
└── api/
    └── contact/route.ts # Contact form API route (Resend)
```

---

## 3. Components Built

### Layout components

| Component | Description |
|---|---|
| `Header` | Responsive navigation bar with logo, nav links, and "Apply Now" CTA button |
| `Footer` | Company info, nav links, social media, legal disclaimers, CEM cross-reference |
| `MobileNav` | Hamburger menu for mobile viewports |

### Page-level components

| Component | Used On | Description |
|---|---|---|
| `HeroSection` | Home | Full-width hero with headline, subheading, CTA buttons, background image/gradient |
| `ProductCard` | Home, Services Hub | Card component for each lending product with icon, title, description, link |
| `StatsBar` | Home | Key metrics: total funded, average close time, LTV range, repeat borrower rate |
| `TestimonialCarousel` | Home | Social proof section with borrower testimonials |
| `CTABanner` | Multiple pages | Call-to-action banner: "Ready to get started?" with Apply Now button |
| `ServiceDetailLayout` | Product pages | Consistent layout for product detail pages: hero, features, terms table, FAQ, CTA |
| `TermsTable` | Product pages | Table showing loan terms: amount range, LTV, term, rate, close time |
| `FAQAccordion` | Product pages, Contact | Expandable FAQ section using shadcn/ui Accordion |
| `ContactForm` | Contact | Multi-field form with inquiry type selector, validation, submission handling |
| `BlogPostCard` | Blog | Card for blog article preview: title, excerpt, date, read time |
| `TeamMember` | About | Team member card with photo, name, title, bio |

### Shared UI components (shadcn/ui)

| Component | Source |
|---|---|
| `Button` | shadcn/ui |
| `Card` | shadcn/ui |
| `Input` | shadcn/ui |
| `Textarea` | shadcn/ui |
| `Select` | shadcn/ui |
| `Accordion` | shadcn/ui |
| `Badge` | shadcn/ui |
| `Sheet` | shadcn/ui (mobile nav) |

---

## 4. Lead Capture & Email Routing

### Contact form fields

| Field | Type | Required | Validation |
|---|---|---|---|
| Full Name | text | Yes | Min 2 characters |
| Email | email | Yes | Valid email format |
| Phone | tel | No | Valid phone format if provided |
| Inquiry Type | select | Yes | One of: Bridge Loan, Fix & Flip, GAP Funding, Micro-Lending, General Inquiry, Partnership |
| Loan Amount (estimated) | text | No | Numeric |
| Property State | select | No | US state dropdown |
| Message | textarea | Yes | Min 10 characters |

### Email routing logic

The contact form API route (`/api/contact/route.ts`) processes submissions and routes emails via Resend:

```
Inquiry Type → Email Recipient
─────────────────────────────────
Bridge Loan        → loans@nexusbridgelending.com
Fix & Flip         → loans@nexusbridgelending.com
GAP Funding        → loans@nexusbridgelending.com
Micro-Lending      → loans@nexusbridgelending.com
General Inquiry    → info@nexusbridgelending.com
Partnership        → partnerships@nexusbridgelending.com
```

### Email template

Each submission generates two emails:
1. **Internal notification** -- sent to the appropriate team with full form data
2. **Confirmation email** -- sent to the submitter acknowledging receipt with expected response time

### API route implementation

```typescript
// apps/web-marketing/src/app/api/contact/route.ts
// POST handler:
// 1. Parse and validate request body (Zod schema)
// 2. Determine recipient based on inquiry type
// 3. Send internal notification email via Resend
// 4. Send confirmation email to submitter via Resend
// 5. Return 200 with success message
// Error handling: 400 for validation errors, 500 for Resend failures
```

### Rate limiting

The contact form does not use Upstash Redis rate limiting (that is introduced in Phase 2 for the portal). Basic abuse prevention is handled by:
- Honeypot field (hidden input that bots fill out)
- Client-side form validation before submission
- Resend's built-in rate limits

---

## 5. Design System

### Tailwind CSS configuration

The marketing site uses a custom Tailwind configuration with NexusBridge brand colors:

| Token | Value | Usage |
|---|---|---|
| `primary` | Dark navy (#0A1628 or similar) | Headers, primary text, nav background |
| `accent` | Gold/amber (#D4A843 or similar) | CTA buttons, highlights, accents |
| `secondary` | Slate gray | Body text, secondary elements |
| `background` | White / light gray | Page backgrounds, cards |
| `destructive` | Red | Error states |
| `success` | Green | Success states |

### Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| H1 | System sans (Inter/Geist) | 3rem-4rem | Bold (700) |
| H2 | System sans | 2rem-2.5rem | Semibold (600) |
| H3 | System sans | 1.5rem-1.75rem | Semibold (600) |
| Body | System sans | 1rem | Regular (400) |
| Small | System sans | 0.875rem | Regular (400) |

### Responsive breakpoints

| Breakpoint | Width | Layout Changes |
|---|---|---|
| Mobile | < 640px | Single column, hamburger nav, stacked cards |
| Tablet | 640px-1024px | Two-column grids, condensed nav |
| Desktop | > 1024px | Full layout, expanded nav, multi-column grids |

### Component library

All interactive components use shadcn/ui as the base, styled with NexusBridge brand tokens. This ensures consistency with the portal (Phase 2+) which uses the same component library.

### Design principles

1. **Professional and trustworthy** -- financial services aesthetic, not startup-casual
2. **Clean whitespace** -- generous padding and margins, no visual clutter
3. **Strong CTAs** -- every page has a clear path to "Apply Now" or "Contact Us"
4. **Accessible** -- WCAG 2.1 AA compliance (contrast ratios, keyboard navigation, screen reader support)
5. **Fast** -- no unnecessary animations, optimized images, minimal JavaScript

---

## 6. SEO & Performance

### SEO metadata

Every page includes:
- `<title>` -- unique, descriptive, under 60 characters
- `<meta name="description">` -- unique, under 160 characters
- `<meta name="keywords">` -- relevant lending terms
- Canonical URL
- Structured data (JSON-LD) for Organization and Service schemas

### Open Graph tags

Every page includes:
- `og:title`
- `og:description`
- `og:image` (branded social share image)
- `og:url`
- `og:type` (website)
- `twitter:card` (summary_large_image)
- `twitter:title`
- `twitter:description`

### Sitemap & robots.txt

- `sitemap.xml` generated at build time via Next.js metadata API
- `robots.txt` allows all crawlers, references sitemap URL
- All pages are indexable (no `noindex` tags)

### Performance optimizations

| Optimization | Implementation |
|---|---|
| Image optimization | Next.js `<Image>` component with automatic WebP conversion, lazy loading |
| Font optimization | `next/font` with system font fallbacks, font-display: swap |
| Code splitting | Next.js automatic per-route code splitting |
| Static generation | All marketing pages are statically generated at build time (no runtime DB queries) |
| CSS purging | Tailwind CSS purges unused styles in production builds |
| Compression | Vercel serves with Brotli/gzip compression |
| CDN | Vercel Edge Network for global CDN distribution |

### Performance targets

| Metric | Target |
|---|---|
| Lighthouse Performance | > 90 |
| Lighthouse Accessibility | > 90 |
| Lighthouse Best Practices | > 90 |
| Lighthouse SEO | > 90 |
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Cumulative Layout Shift | < 0.1 |

---

## 7. Entity Separation Rules

### What appears on the NexusBridge site

| Content | Allowed |
|---|---|
| Bridge Loans | ✅ |
| Fix & Flip Financing | ✅ |
| GAP Funding | ✅ |
| Micro-Lending | ✅ |
| NexusBridge Capital LP (private credit fund) | ✅ (as investor product under NexusBridge) |
| Borrower application flow | ✅ |
| Lending terms and rates | ✅ |

### What must NOT appear on the NexusBridge site

| Content | Allowed |
|---|---|
| Real Estate Fund (CEM equity product) | ❌ |
| Crowdfund (CEM equity product) | ❌ |
| CEM Advisory / Education services | ❌ |
| Equity investment products of any kind | ❌ |
| CEM branding as primary | ❌ |

### Required cross-references

- Footer must include: "Managed by Capital Edge Management, Inc." with link to capitaledgeinvest.com
- About page may reference CEM as the parent management company
- No CEM product details, pricing, or CTAs on the NexusBridge site

### Corporate structure reference (footer or about page)

```
Capital Edge Management, Inc. (CEM)
    └── Obsidian & Co. Holdings, LLC
            ├── NexusBridge Capital LP   ← private credit fund (Reg D / 506(c))
            └── NexusBridge Lending LLC  ← lending platform (this site)
```

---

## 8. Deployment

### Hosting

| Setting | Value |
|---|---|
| Provider | Vercel |
| Framework | Next.js (auto-detected) |
| Build command | `npm run build` |
| Output directory | `.next` |
| Node.js version | 18.x or 20.x |
| Region | US East (iad1) |
| Custom domain | nexusbridgelending.com |
| SSL | Automatic (Vercel managed) |
| Preview deployments | Enabled (every PR gets a preview URL) |

### Deployment pipeline

```
Push to main → Vercel auto-deploys → Build → Static generation → CDN distribution
Push to PR branch → Vercel preview deployment → Unique preview URL
```

### DNS configuration

| Record | Type | Value |
|---|---|---|
| `@` | A | 76.76.21.21 (Vercel) |
| `www` | CNAME | cname.vercel-dns.com |

---

## 9. Environment Variables

### Required env vars (`apps/web-marketing/.env.local`)

| Variable | Purpose | Server/Client |
|---|---|---|
| `RESEND_API_KEY` | Resend SDK for email sending | Server only |

### Optional env vars

| Variable | Purpose | Server/Client |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for SEO | Client |
| `NEXT_PUBLIC_GA_ID` | Google Analytics tracking ID | Client |

### Notes

- The marketing site has **no database** -- no Supabase credentials needed
- The marketing site has **no authentication** -- no auth-related env vars
- The marketing site has **no rate limiting** -- no Upstash credentials needed
- `RESEND_API_KEY` must never be prefixed with `NEXT_PUBLIC_` -- it is server-only

---

## 10. Testing Checklist

### Functional tests

- [ ] All 8 pages render without errors
- [ ] Contact form validates all required fields
- [ ] Contact form rejects invalid email addresses
- [ ] Contact form honeypot field prevents bot submissions
- [ ] Contact form submits successfully and returns confirmation
- [ ] Internal notification email sent to correct recipient based on inquiry type
- [ ] Confirmation email sent to submitter
- [ ] All navigation links point to correct routes
- [ ] "Apply Now" CTA links to portal borrower application (or placeholder)
- [ ] Mobile hamburger menu opens and closes correctly
- [ ] All product pages display correct terms and content

### Visual / responsive tests

- [ ] All pages render correctly on mobile (< 640px)
- [ ] All pages render correctly on tablet (640px-1024px)
- [ ] All pages render correctly on desktop (> 1024px)
- [ ] No horizontal scroll on any viewport
- [ ] Images load with correct aspect ratios
- [ ] Dark text on light backgrounds has sufficient contrast (WCAG AA)

### SEO tests

- [ ] Every page has a unique `<title>`
- [ ] Every page has a unique `<meta name="description">`
- [ ] Every page has Open Graph tags
- [ ] `sitemap.xml` includes all public routes
- [ ] `robots.txt` is accessible and correctly configured
- [ ] No broken links (internal or external)

### Performance tests

- [ ] Lighthouse Performance > 90 on Home page
- [ ] Lighthouse Accessibility > 90 on all pages
- [ ] No render-blocking resources
- [ ] All images use Next.js `<Image>` component
- [ ] No unused CSS in production build

### Entity separation tests

- [ ] No equity investment products mentioned on any page
- [ ] No CEM product details, pricing, or CTAs
- [ ] Footer includes CEM cross-reference (management company only)
- [ ] About page references CEM relationship correctly (no product promotion)

### Deployment tests

- [ ] `npm run build` completes without errors
- [ ] `npm run lint` passes with no errors
- [ ] Vercel deployment succeeds
- [ ] Custom domain resolves correctly
- [ ] SSL certificate is valid
- [ ] Preview deployments work on PR branches
