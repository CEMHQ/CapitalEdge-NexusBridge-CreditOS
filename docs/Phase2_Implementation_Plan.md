# Phase 2 Implementation Plan

Supabase Auth, RBAC, Role Dashboards, Unified Portal

---

## 1. Phase Overview & Goals

### Goals

Phase 2 builds the unified portal (`apps/portal`) with authentication, role-based access control, and all six role dashboards. This transforms the platform from a static marketing site into an interactive application where borrowers, investors, and internal staff can log in and perform role-specific actions.

1. **Authentication** -- Supabase Auth with email/password, magic link, and admin invite flows, all using PKCE for security
2. **Role-based access control** -- 6 roles enforced at middleware, API, and database (RLS) layers; `user_roles` table as the single source of truth
3. **Role dashboards** -- each role gets a tailored dashboard with appropriate navigation, data views, and actions
4. **Security enforcement** -- layered security: middleware rate limiting, auth checks, role route guards, Zod validation, user-level rate limiting, RLS
5. **Invite flow** -- admin can invite internal users (underwriter, servicing, manager) and external users (borrower, investor) with role pre-assignment

### What success looks like

- Users can sign up, log in, and are redirected to their role-appropriate dashboard
- Admins can invite users with a specific role; the invite email leads to a password-set flow
- Unauthorized route access is blocked at middleware and redirected to login or dashboard
- All 6 role dashboards render with correct navigation and placeholder content
- RLS policies prevent cross-user data access at the database level
- Rate limiting prevents brute-force attacks on auth and API endpoints

### Status: ✅ Complete

The unified portal is live on Vercel. All roles, dashboards, auth flows, and security layers are functional.

### Connection to Phase 1 and Phase 3

- Phase 1's "Apply Now" CTA links to the portal's borrower application flow
- Phase 2 delivers the dashboard shells; Phase 3 populates them with real data (documents, underwriting, loans, fund operations)
- The `user_roles` table, middleware, and auth helpers established in Phase 2 are used by every subsequent phase

---

## 2. Auth Architecture

### Supabase Auth configuration

| Setting | Value |
|---|---|
| Provider | Supabase Auth (GoTrue) |
| Auth methods | Email/password, magic link |
| Flow type | PKCE (Proof Key for Code Exchange) |
| Session management | Supabase SSR cookies (`@supabase/ssr`) |
| JWT customization | None -- roles come from `user_roles` table, not JWT claims |
| Email provider | Supabase built-in (development) / Resend (production) |

### Key design decisions

1. **Roles are NOT stored in JWT metadata.** The `user_roles` table is the single source of truth. Every role check queries this table via `getUserRole(supabase, user.id)`. This avoids stale JWT claims and supports real-time role changes.

2. **PKCE flow for all browser-initiated auth.** The Supabase browser client (`src/lib/supabase/client.ts`) is configured with `flowType: 'pkce'`. This ensures magic links and OAuth flows use code verifiers stored in cookies, not raw JWTs in URLs.

3. **Two auth callback routes, not one.** Different auth flows have different security characteristics and are handled by separate routes (see Section 3).

4. **Server-side session validation.** Every API route and server component validates the session via `getUser()` which calls `supabase.auth.getUser()` -- this hits the Supabase Auth server, not just the local JWT, preventing expired or revoked sessions from being accepted.

### Auth helper files

| File | Purpose |
|---|---|
| `src/lib/supabase/client.ts` | Browser Supabase client (PKCE enabled) |
| `src/lib/supabase/server.ts` | Server-side Supabase client (cookie-based session) |
| `src/lib/supabase/admin.ts` | Service-role admin client (server-only, `import 'server-only'`) |
| `src/lib/supabase/middleware.ts` | Middleware Supabase client (for auth check in middleware) |
| `src/lib/auth/helpers.ts` | `getUser()`, `getUserRole()`, `requireRole()` |

### Service-role admin client

The admin client (`createAdminClient()`) uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS. It is:
- Imported only in server-only files (enforced by `import 'server-only'`)
- Used for admin operations: invite user, update user role, delete user
- Never exposed to the browser client

---

## 3. Callback Routes

### `/auth/confirm` -- Invite and password reset

| Property | Value |
|---|---|
| Method | GET |
| Auth flow | Invite acceptance, password reset |
| Token type | `token_hash` (hashed, not raw JWT) |
| Supabase method | `verifyOtp({ token_hash, type })` |
| Query params | `token_hash`, `type` (invite, recovery), `next` (redirect target) |

**Flow:**
```
1. Admin sends invite → Supabase emails link with token_hash
2. User clicks link → /auth/confirm?token_hash=xxx&type=invite&next=/dashboard
3. Server route calls verifyOtp(token_hash) → creates session
4. User is redirected to password-set page (if invite) or next URL
5. After password set → redirected to role-appropriate dashboard
```

**Security notes:**
- Token hash is a one-time-use SHA-256 hash -- not a raw JWT
- The invite email template uses `{{ .TokenHash }}` -- never `{{ .ConfirmationURL }}`
- Token expires after the configured duration (default 24 hours)

### `/auth/callback` -- Magic link and OAuth

| Property | Value |
|---|---|
| Method | GET |
| Auth flow | Magic link, OAuth (future) |
| Token type | PKCE authorization code |
| Supabase method | `exchangeCodeForSession(code)` |
| Query params | `code` |

**Flow:**
```
1. User requests magic link → Supabase emails link with PKCE code
2. User clicks link → /auth/callback?code=xxx
3. Server route calls exchangeCodeForSession(code) → creates session
4. Code verifier from cookie validates the exchange (PKCE)
5. User redirected to role-appropriate dashboard
```

**Security notes:**
- PKCE code is a one-time-use authorization code, not a session token
- Code verifier is stored in an HTTP-only cookie during the initial magic link request
- No raw JWTs appear in URLs at any point

### Rules

- Do not add a third auth redirect route -- extend these two
- Invite `redirectTo` must point to `${NEXT_PUBLIC_APP_URL}/auth/confirm`
- The browser client has `flowType: 'pkce'` -- do not remove it

---

## 4. Role System

### `user_roles` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK -> auth.users.id, unique |
| role | text | One of: `borrower`, `investor`, `admin`, `manager`, `underwriter`, `servicing` |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

**Constraints:**
- `user_id` is unique -- each user has exactly one role
- `role` is constrained to the 6 valid values
- RLS: users can read their own role; admins can read/write all roles

### `handle_new_user()` trigger

A PostgreSQL trigger function that fires on `INSERT` to `auth.users`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Create profile record
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');

  -- Create user_roles record
  -- Role comes from invite metadata or defaults to 'borrower'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'borrower'));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Key behavior:**
- If the invite includes `role` in `raw_user_meta_data`, that role is assigned
- If no role metadata exists (self-signup), defaults to `borrower`
- Both `profiles` and `user_roles` records are created atomically in the same trigger

### SQL helper functions

#### `get_user_role(user_uuid uuid)`

```sql
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS text AS $$
  SELECT role FROM public.user_roles WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

Used in RLS policies and API routes to check a user's role.

#### `is_admin()`

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

Used in RLS policies for admin-only tables.

#### `is_internal_user()`

```sql
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'underwriter', 'servicing')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

Used in RLS policies for internal-only tables (underwriting, loans, etc.).

---

## 5. Middleware & Route Guards

### Middleware file: `src/middleware.ts`

The middleware runs on every request and enforces security in this order:

```
1. IP rate limit (Upstash Redis) → 429 if exceeded
2. Auth check (Supabase session) → redirect to /login if not authenticated
3. Role route guard (canAccess) → redirect to /dashboard if wrong role
```

### `canAccess()` function

Maps routes to allowed roles:

| Route Pattern | Allowed Roles |
|---|---|
| `/dashboard/borrower/**` | borrower |
| `/dashboard/investor/**` | investor |
| `/dashboard/admin/**` | admin |
| `/dashboard/manager/**` | admin, manager |
| `/dashboard/underwriter/**` | admin, underwriter |
| `/dashboard/servicing/**` | admin, servicing |
| `/dashboard` | all authenticated |
| `/api/admin/**` | admin, manager |
| `/api/underwriting/**` | admin, manager, underwriter |
| `/api/loans/**` | admin, manager, servicing |

### Route redirect logic

```
Unauthenticated user → /login
Authenticated user accessing wrong role's routes → /dashboard (their own)
Authenticated user accessing /login → /dashboard (their own)
Authenticated user accessing / → /dashboard (their own)
```

### Role-to-dashboard mapping

| Role | Dashboard URL |
|---|---|
| borrower | `/dashboard/borrower` |
| investor | `/dashboard/investor` |
| admin | `/dashboard/admin` |
| manager | `/dashboard/admin` (shared admin layout) |
| underwriter | `/dashboard/underwriter` |
| servicing | `/dashboard/servicing` |

---

## 6. Role Dashboards

### Dashboard directory structure

```
apps/portal/src/app/(protected)/dashboard/
├── page.tsx                    # Router: redirects to role-specific dashboard
├── layout.tsx                  # Shared layout: sidebar nav, header, notification bell
├── borrower/
│   ├── page.tsx               # Borrower dashboard home
│   ├── applications/
│   │   ├── page.tsx           # My Applications list
│   │   └── [id]/page.tsx      # Application detail
│   ├── documents/page.tsx     # My Documents
│   └── notifications/page.tsx # Notifications inbox
├── investor/
│   ├── page.tsx               # Investor dashboard home
│   ├── portfolio/page.tsx     # Portfolio overview
│   ├── statements/page.tsx    # Statements / transaction history
│   └── notifications/page.tsx # Notifications inbox
├── admin/
│   ├── page.tsx               # Admin dashboard home
│   ├── applications/page.tsx  # All applications
│   ├── investors/page.tsx     # All investors
│   ├── documents/page.tsx     # Document review queue
│   ├── underwriting/page.tsx  # Underwriting cases
│   ├── users/page.tsx         # User management
│   ├── tasks/page.tsx         # Task management
│   ├── workflows/page.tsx     # Workflow triggers (Phase 4)
│   ├── audit/page.tsx         # Audit log viewer
│   ├── funds/page.tsx         # Fund dashboard
│   └── invite/page.tsx        # Invite user form
├── underwriter/
│   ├── page.tsx               # Underwriter dashboard home
│   ├── cases/page.tsx         # Assigned cases
│   └── tasks/page.tsx         # My tasks
└── servicing/
    ├── page.tsx               # Servicing dashboard home
    ├── loans/page.tsx         # Active loans
    └── tasks/page.tsx         # My tasks
```

### Dashboard home pages

Each role's home page (`page.tsx`) displays:
- Welcome message with user name
- Key metrics cards (populated in Phase 3)
- Quick action buttons (role-appropriate)
- Recent activity feed (populated in Phase 3)

---

## 7. Navigation per Role

### Sidebar navigation

| Role | Navigation Links |
|---|---|
| **borrower** | Dashboard, My Applications, Documents, Notifications |
| **investor** | Dashboard, Portfolio, Statements, Notifications |
| **admin** | Dashboard, Applications, Investors, Documents, Underwriting, Users, Tasks, Workflows, Audit Log, Invite User |
| **manager** | Dashboard, Applications, Investors, Documents, Tasks, Audit Log, Invite User |
| **underwriter** | Dashboard, Cases, Tasks |
| **servicing** | Dashboard, Loans, Tasks |

### Navigation implementation

The sidebar navigation component reads the user's role and renders the appropriate links. The navigation configuration is centralized in a single file:

```typescript
// src/config/navigation.ts
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  borrower: [
    { label: 'Dashboard', href: '/dashboard/borrower', icon: Home },
    { label: 'My Applications', href: '/dashboard/borrower/applications', icon: FileText },
    { label: 'Documents', href: '/dashboard/borrower/documents', icon: Upload },
    { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  ],
  investor: [
    { label: 'Dashboard', href: '/dashboard/investor', icon: Home },
    { label: 'Portfolio', href: '/dashboard/investor/portfolio', icon: PieChart },
    { label: 'Statements', href: '/dashboard/investor/statements', icon: Receipt },
    { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  ],
  // ... admin, manager, underwriter, servicing
};
```

### Header components

| Component | Description |
|---|---|
| `NotificationBell` | Shows unread notification count, dropdown with recent notifications, link to full inbox |
| `UserMenu` | Avatar/initials, role badge, profile link, sign out button |
| `BreadcrumbNav` | Auto-generated breadcrumbs based on current route |

---

## 8. Invite Flow

### Admin invite process

```
1. Admin navigates to /dashboard/admin/invite
2. Admin fills form: email, full name, role (dropdown)
3. API route calls supabase.auth.admin.inviteUserByEmail({
     email,
     data: { full_name, role },
     options: { redirectTo: `${APP_URL}/auth/confirm` }
   })
4. Supabase sends invite email with token_hash link
5. New user clicks link → /auth/confirm?token_hash=xxx&type=invite
6. verifyOtp() creates session, handle_new_user() trigger creates profile + user_roles
7. User sets password
8. User redirected to role-appropriate dashboard
```

### Invite form fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Email | email | Yes | Must not already exist in auth.users |
| Full Name | text | Yes | Passed via user_metadata |
| Role | select | Yes | One of: borrower, investor, admin, manager, underwriter, servicing |

### Invite API route

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/admin/invite` | admin | Send invite email with role assignment |

### Invite email template

The Supabase invite email template must use `{{ .TokenHash }}` format:

```
Subject: You've been invited to NexusBridge CreditOS

Click the link below to set your password and access the platform:

{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/dashboard
```

### Security notes

- Only `admin` role can send invites
- The invite creates a `user_roles` record with the specified role via the `handle_new_user()` trigger
- Token hash is a one-time-use SHA-256 hash -- not a raw JWT
- Invite tokens expire after 24 hours (configurable in Supabase dashboard)
- Admin cannot invite a user who already exists

---

## 9. RLS Policies

### Phase 2 tables with RLS

| Table | Policy Summary |
|---|---|
| `profiles` | Users can SELECT/UPDATE their own profile; admins can SELECT/UPDATE all |
| `user_roles` | Users can SELECT their own role; admins can SELECT/UPDATE all |
| `notifications` | Users can SELECT/UPDATE their own notifications; admins can SELECT all |

### RLS pattern

All Phase 2 RLS policies follow this pattern:

```sql
-- User can read their own data
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- User can update their own data
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admin can read all data
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- Admin can update all data
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin());
```

### RLS enforcement rules

1. RLS is enabled on **every** table in the `public` schema
2. The service-role admin client bypasses RLS -- used only in server-only API routes for admin operations
3. The regular Supabase client (session-based) always goes through RLS
4. RLS policies use `auth.uid()` and the SQL helper functions (`is_admin()`, `is_internal_user()`, `get_user_role()`)
5. No RLS policy uses JWT metadata for role checks -- always the `user_roles` table

---

## 10. API Routes

### Phase 2 API routes

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/api/admin/invite` | admin | Send invite email with role assignment |
| PATCH | `/api/admin/users/[id]` | admin | Update user role or status |
| GET | `/api/notifications` | all authenticated | Get user's notifications (paginated) |
| PATCH | `/api/notifications` | all authenticated | Mark all notifications as read |
| PATCH | `/api/notifications/[id]` | all authenticated | Mark single notification as read |

### API route security pattern

Every API route follows the enforcement order defined in the system architecture:

```typescript
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 1. Validate request body
  const body = validateBody(req, updateUserSchema);

  // 2. Rate limit by user ID
  await applyRateLimit(req, adminLimiter);

  // 3. Authenticate
  const supabase = createServerClient();
  const user = await getUser(supabase);

  // 4. Authorize
  const role = await getUserRole(supabase, user.id);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 5. Execute DB operation
  // ...

  // 6. Emit audit event
  emitAuditEvent({ ... });

  return NextResponse.json({ success: true });
}
```

---

## 11. Environment Variables

### Required env vars (`apps/portal/.env.local`)

| Variable | Purpose | Server/Client |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (RLS-restricted) | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | Server only |
| `DATABASE_URL` | PostgreSQL connection string (Drizzle ORM, port 6543) | Server only |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for rate limiting | Server only |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Server only |
| `NEXT_PUBLIC_APP_URL` | Portal URL for redirects (e.g. `https://your-app.vercel.app`) | Client |

### Notes

- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` must only be imported in files that include `import 'server-only'`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe for the browser -- it only allows RLS-restricted access
- `NEXT_PUBLIC_APP_URL` is used in invite emails for the `redirectTo` parameter
- All env vars must be set in Vercel project settings for production

---

## 12. Security Notes

### Authentication security

| Measure | Implementation |
|---|---|
| PKCE flow | Prevents authorization code interception; code verifier in HTTP-only cookie |
| No raw JWTs in URLs | Token hash and PKCE codes are one-time-use, not session tokens |
| Server-side session validation | `getUser()` calls Supabase Auth server, not just local JWT decode |
| Session cookies | HTTP-only, Secure, SameSite=Lax; managed by `@supabase/ssr` |
| Password requirements | Minimum 8 characters (Supabase default, configurable) |

### Rate limiting

| Endpoint | Identifier | Limit | Window |
|---|---|---|---|
| All routes (middleware) | IP address | 60 requests | 1 minute |
| `/api/admin/invite` | User ID | 10 requests | 1 hour |
| `/api/admin/users/[id]` | User ID | 20 requests | 1 hour |
| `/api/notifications` | User ID | 30 requests | 1 minute |

### RBAC enforcement layers

```
Layer 1: Middleware (route-level) — blocks navigation to wrong role's pages
Layer 2: API route (operation-level) — checks role before executing action
Layer 3: RLS (row-level) — database enforces data access even if layers 1-2 are bypassed
```

All three layers must agree. A request must pass middleware, API authorization, AND RLS to succeed.

### Common security mistakes to avoid

1. **Never use `user.user_metadata?.role`** for role checks -- always `getUserRole(supabase, user.id)`
2. **Never import `SUPABASE_SERVICE_ROLE_KEY`** in client-accessible files
3. **Never disable RLS** on any public-schema table
4. **Never expose the admin client** to browser-side code
5. **Never skip `getUser()`** in an API route -- even if the middleware already checked auth
6. **Never hardcode roles** in RLS policies -- use the SQL helper functions

---

## 13. Testing Checklist

### Authentication tests

- [ ] Email/password signup creates profile and user_roles records
- [ ] Email/password login redirects to role-appropriate dashboard
- [ ] Magic link login works end-to-end (request → email → click → session)
- [ ] Admin invite works end-to-end (send → email → click → set password → dashboard)
- [ ] Invite with each role creates the correct user_roles record
- [ ] Expired invite token shows clear error message
- [ ] Password reset flow works end-to-end
- [ ] Sign out clears session and redirects to login

### RBAC tests

- [ ] Borrower cannot access `/dashboard/admin/**` (middleware redirects)
- [ ] Investor cannot access `/dashboard/borrower/**` (middleware redirects)
- [ ] Underwriter cannot access `/dashboard/admin/users` (middleware redirects)
- [ ] Manager can access admin routes except user management
- [ ] Unauthenticated user is redirected to `/login` from any protected route
- [ ] Authenticated user is redirected from `/login` to their dashboard
- [ ] API routes return 403 for wrong-role requests
- [ ] RLS prevents cross-user data access (user A cannot read user B's notifications)

### Rate limiting tests

- [ ] Middleware rate limit returns 429 after exceeding IP limit
- [ ] API route rate limit returns 429 after exceeding user limit
- [ ] Rate limit headers are present in responses (X-RateLimit-Remaining, etc.)

### Invite flow tests

- [ ] Only admin role can access invite form and API
- [ ] Invite to existing email returns appropriate error
- [ ] Invite with each role assigns the correct role
- [ ] Invited user can set password and access dashboard
- [ ] Invite email contains correct link format (token_hash, not raw JWT)

### Dashboard tests

- [ ] All 6 role dashboards render without errors
- [ ] Navigation shows correct links for each role
- [ ] NotificationBell shows unread count
- [ ] UserMenu shows correct role badge
- [ ] Profile page allows name/email updates
- [ ] Dashboard home pages display welcome message and quick actions

### RLS tests

- [ ] User can read their own profile but not others
- [ ] User can read their own notifications but not others
- [ ] Admin can read all profiles and notifications
- [ ] Service-role client bypasses RLS (admin operations work)
- [ ] Anonymous client (no session) cannot read any data
