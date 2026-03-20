# NexusBridge CreditOS — Testing Checklist

Use this document when doing a full QA pass of both apps. Check off items as you go.
Each section is organized by role or surface area. Start with Auth, then work through each role top to bottom.

---

## Setup Before Testing

- [ ] Have at least one test account for each role: `admin`, `manager`, `underwriter`, `servicing`, `investor`, `borrower`
- [ ] Have at least one submitted application with documents in the system
- [ ] Have at least one investor record in the system
- [ ] Note the application ID and loan ID from the DB for use in task creation

---

## 1. Marketing Website (nexusbridgelending.com)

### Pages

- [ ] **Home** (`/`) — hero, loan program cards, how it works, FAQ accordion, newsletter form
- [ ] **Loan Programs** (`/loan-programs`) — all programs listed, CTA buttons link correctly
- [ ] **How It Works** (`/how-it-works`) — steps render correctly
- [ ] **Investors** (`/investors`) — investor-focused content, no lending products from NexusBridge Lending LLC crossed with CEM equity products
- [ ] **About** (`/about`) — correct entity names (NexusBridge Lending LLC / Capital Edge Management, Inc.)
- [ ] **Apply** (`/apply`) — lead capture form submits, confirmation shown, email received
- [ ] **Contact** (`/contact`) — contact form submits, confirmation shown, email received
- [ ] **Disclosures** (`/disclosures`) — page loads, legal text present

### Global

- [ ] Nav links work on desktop and mobile (hamburger menu)
- [ ] Footer links are correct; NexusBridge footer references CEM, CEM references NexusBridge
- [ ] No broken images or console errors on any page
- [ ] Entity separation: no equity investment products (real estate fund, crowdfund) appear on the NexusBridge marketing site

---

## 2. Portal — Auth Flows

### Sign Up

- [ ] `/signup` — create a new borrower account
- [ ] Confirmation email received; clicking link activates account
- [ ] After confirming, redirected to borrower dashboard

### Login

- [ ] `/login` — valid credentials log in and redirect to correct dashboard by role
- [ ] Invalid credentials show error, no crash
- [ ] Unauthenticated access to `/dashboard/*` redirects to `/login`

### Forgot Password

- [ ] `/forgot-password` — submit email, receive reset email
- [ ] Reset link leads to `/set-password`
- [ ] Setting a new password logs in and redirects to dashboard

### Invite Flow (staff accounts)

- [ ] Admin sends invite from `/dashboard/admin/invite` with a role
- [ ] Invitee receives email, clicks link, lands on `/auth/confirm`
- [ ] Invitee sets password and lands on the correct role dashboard

### Sign Out

- [ ] Sign out button in nav clears session and redirects to `/login`
- [ ] Back button after sign out does not restore session

---

## 3. Portal — Borrower Role

### Dashboard (`/dashboard/borrower`)

- [ ] Shows application status card with latest application number and status
- [ ] Shows requested amount and loan purpose
- [ ] Application rows in "Your Applications" section are clickable links
- [ ] "New Application" button navigates to `/dashboard/borrower/apply`

### Apply (`/dashboard/borrower/apply`)

- [ ] Form submits with valid data — redirected to dashboard with success banner
- [ ] Validation: required fields enforce minimums (loan amount ≥ $25,000)
- [ ] Duplicate submission creates a second application (not an error)

### My Applications (`/dashboard/borrower/applications`)

- [ ] Lists all applications for this borrower
- [ ] Status badges render correctly
- [ ] "View →" links to the correct detail page
- [ ] "New Application" button present

### Application Detail (`/dashboard/borrower/applications/[id]`)

- [ ] Loan details section shows purpose, amount, term, exit strategy
- [ ] Property section shows address, type, occupancy, values
- [ ] **Action Required callout** appears (orange) when there are open conditions
- [ ] Open conditions list the type and description
- [ ] Documents section shows all uploaded docs with review status badges
- [ ] Rejected documents show the rejection reason
- [ ] Resolved conditions section appears at bottom when conditions exist
- [ ] Visiting another borrower's application ID returns 404

### Documents (`/dashboard/borrower/documents`)

- [ ] Lists all uploaded documents with review status (pending / under review / verified / rejected)
- [ ] Rejected documents show rejection reason inline
- [ ] Upload form works — file uploads successfully
- [ ] After upload, new document appears in the list with `pending_review` status
- [ ] If application is already `under_review`, uploaded doc starts at `under_review`

### Notifications

- [ ] Bell icon visible in nav
- [ ] After admin changes application status → unread count appears on bell
- [ ] After admin reviews a document → unread count appears on bell
- [ ] Clicking bell opens dropdown with the notification
- [ ] Unread notifications have blue dot and blue tinted background
- [ ] Clicking a notification marks it read (dot disappears) and navigates to the link
- [ ] "Mark all read" clears all badges
- [ ] "View all notifications" → `/dashboard/notifications` shows full inbox

---

## 4. Portal — Investor Role

### Dashboard (`/dashboard/investor`)

- [ ] Summary cards render (portfolio value, distributions, etc.)
- [ ] No lending/debt products visible (entity separation)

### Portfolio (`/dashboard/investor/portfolio`)

- [ ] Fund allocations and subscription status visible
- [ ] NAV data displayed

### Statements (`/dashboard/investor/statements`)

- [ ] Statement data renders or empty state shown
- [ ] No error thrown when no data exists

### Notifications

- [ ] Bell icon visible and functional

---

## 5. Portal — Admin Role

### Dashboard (`/dashboard/admin`)

- [ ] Summary metrics load without error

### Applications (`/dashboard/admin/applications`)

- [ ] Lists all applications across all borrowers
- [ ] Status filter tabs work (submitted, under_review, approved, etc.)
- [ ] "Review →" link opens correct detail page
- [ ] **Delete button** — confirm prompt appears; deleting removes row from list
- [ ] Delete blocked if application has an active loan (error message shown)

### Application Detail (`/dashboard/admin/applications/[id]`)

- [ ] Borrower info, property, loan scenario all display correctly
- [ ] **Status form** — change status, verify transition rules enforced (e.g. can't go submitted → funded)
- [ ] Moving to `under_review` auto-creates underwriting case
- [ ] Moving to `under_review` syncs pending documents to `under_review` status
- [ ] Changing status triggers in-app notification to borrower (check their bell)
- [ ] **Edit Details** — click, form expands; change amount + address, save; page refreshes with new values
- [ ] Edit Details blocked for underwriter and servicing roles (403)
- [ ] **Delete Application** button — prompt appears; redirects to list after deletion
- [ ] Underwriter Metrics form (internal only, not shown to borrower)
- [ ] Create Loan form appears when status is `approved`

### Investors (`/dashboard/admin/investors`)

- [ ] Lists all investors with status badges
- [ ] **Edit** button — expands inline; change accreditation/KYC/onboarding dropdowns; save updates badges
- [ ] **Delete** button — blocked if investor has fund subscriptions (error); otherwise removes row

### Documents (`/dashboard/admin/documents`)

- [ ] Grouped by: Pending Review, In Review, Completed
- [ ] Each doc shows file name, uploader, associated application (with link), type, status
- [ ] **Review link** → document detail page
- [ ] **Delete** button per row removes document

### Document Detail (`/dashboard/admin/documents/[id]`)

- [ ] Document info and uploader shown
- [ ] "Associated With" links to the correct application
- [ ] Approve: status changes to `verified`; borrower receives in-app notification + email
- [ ] Reject: entering a reason and rejecting sets status to `rejected`; reason saved; borrower notified
- [ ] Reject without reason blocked by validation
- [ ] Delete button — removes document, redirects to documents list

### Users (`/dashboard/admin/users`)

- [ ] Lists all users with role badges and status
- [ ] **Edit Role** — click Edit, select new role from dropdown, save; badge updates
- [ ] Edit Role hidden on your own account row
- [ ] **Delete** — blocked on own account; deletes other users with full cascade (applications, documents, borrower record, auth user)
- [ ] Delete blocked if user has active loan

### Audit Log (`/dashboard/admin/audit`)

- [ ] Events appear after any action (status change, document review, etc.)
- [ ] Filter by event type — only matching rows shown
- [ ] Filter by entity type — only matching rows shown
- [ ] Filter by date range — outside-range events hidden
- [ ] Clear link resets all filters
- [ ] Entity ID links navigate to the correct detail page
- [ ] "View payload" expands JSON for each event
- [ ] Pagination works (Previous / Next)

### Tasks (`/dashboard/admin/tasks`)

- [ ] Status tabs: Open, In Progress, Completed, Cancelled — counts update correctly
- [ ] **New Task** button — form expands; fill title, owner type, paste application UUID as owner ID, assign to a staff user, set due date; create
- [ ] New task appears in Open tab
- [ ] **Start** button — task moves to In Progress tab
- [ ] **Complete** button — task moves to Completed tab
- [ ] Overdue tasks show red date with warning icon
- [ ] **Delete** — confirm prompt; task removed from list
- [ ] Invalid UUID in owner ID field shows validation error

### Workflows (`/dashboard/admin/workflows`)

- [ ] Page loads with 5 seeded triggers (all inactive)
- [ ] **New Workflow** button — form expands; select event type; conditions hint auto-populates
- [ ] Create workflow with valid JSON conditions and actions → appears in list as inactive
- [ ] Create workflow with activate immediately checked → appears as active
- [ ] **Toggle** switch enables/disables a workflow (no page reload, state updates in place)
- [ ] **Delete** button — confirm prompt; trigger removed from list
- [ ] Execution count column shows `—` until first event fires
- [ ] Manager can view workflows but toggle/delete buttons are absent
- [ ] Activate "Auto-assign underwriting on review" trigger; move an application to `under_review`; verify a task appears in the Tasks page
- [ ] Activate "Notify team on document upload" trigger; upload a document; verify a task appears
- [ ] Activate "Delinquency detection alert"; transition a loan to `delinquent`; verify urgent task appears

### Fund (`/dashboard/admin/fund`)

- [ ] Fund overview loads without error
- [ ] Subscription management visible

### Invite User (`/dashboard/admin/invite`)

- [ ] Submit with valid email + role → invite email sent
- [ ] Duplicate email shows appropriate error

### Notifications

- [ ] Bell functional; all admin actions that trigger notifications appear here

---

## 6. Portal — Manager Role

Manager sees the same pages as admin **except**:

- [ ] No "Users" nav link (cannot manage users)
- [ ] No "Underwriting" nav link
- [ ] Can edit investor statuses ✓
- [ ] Cannot delete investors (should get 403)
- [ ] Can edit application fields ✓
- [ ] Can change application status ✓
- [ ] Can review documents ✓
- [ ] Can create and manage tasks ✓
- [ ] Audit Log visible ✓
- [ ] Invite User visible ✓

---

## 7. Portal — Underwriter Role

### Cases (`/dashboard/underwriter/cases`)

- [ ] Lists underwriting cases
- [ ] "View" link opens case detail

### Case Detail (`/dashboard/underwriter/cases/[id]`)

- [ ] Application info visible
- [ ] Can record a decision
- [ ] Can add conditions (type + description)
- [ ] Can update condition status (satisfied / waived)
- [ ] Can add risk flags
- [ ] Cannot change application status (403 if attempted via API)
- [ ] Cannot edit application fields (Edit Details not shown / 403 via API)

### Tasks (`/dashboard/admin/tasks`)

- [ ] Only sees tasks assigned to them
- [ ] Can Start and Complete their own tasks
- [ ] Cannot create new tasks (New Task button not shown)
- [ ] Cannot delete tasks

### Notifications

- [ ] Bell functional

---

## 8. Portal — Servicing Role

### Loans (`/dashboard/servicing/loans`)

- [ ] Lists all active loans
- [ ] Status badges render correctly

### Loan Detail (`/dashboard/servicing/loans/[id]`)

- [ ] Loan info, payment schedule, payments, draws displayed
- [ ] **Record Payment** — submit payment, appears in payment history
- [ ] **Manage Draws** — request and approve draw
- [ ] **Loan Status** — can transition active loan status
- [ ] Cannot access application edit or investor management (403)

### Tasks (`/dashboard/admin/tasks`)

- [ ] Only sees tasks assigned to them
- [ ] Can Start and Complete their own tasks
- [ ] Cannot create or delete tasks

### Notifications

- [ ] Bell functional

---

## 9. Cross-Cutting Checks

### Role Isolation

- [ ] Borrower cannot access `/dashboard/admin/*` — redirected or 403
- [ ] Investor cannot access `/dashboard/admin/*`
- [ ] Underwriter cannot access investor or user management routes
- [ ] Each role lands on their correct dashboard after login

### Notifications End-to-End

| Trigger | Who gets notified |
|---|---|
| Application status changed | Borrower (in-app + email) |
| Document verified | Borrower (in-app + email) |
| Document rejected | Borrower (in-app + email) |

- [ ] All three triggers produce in-app notifications
- [ ] All three triggers produce emails (check inbox)
- [ ] Notification links navigate to the correct page

### Audit Trail

After each of the following, verify an entry appears in `/dashboard/admin/audit`:

- [ ] Application status change
- [ ] Document reviewed (approved or rejected)
- [ ] User role updated
- [ ] Investor status updated
- [ ] User deleted
- [ ] Investor deleted

### Security Basics

- [ ] Unauthenticated requests to all `/api/*` routes return 401
- [ ] Wrong-role requests to restricted routes return 403
- [ ] Borrower cannot view another borrower's application detail (404)
- [ ] Rate limiting: rapid repeated submissions return 429

---

## 10. Known Limitations (Not Yet Built)

These are intentionally not built — do not file as bugs:

- Borrower cannot edit a submitted application (by design — admin edits on their behalf)
- No real-time loan repayment calculator in borrower portal
- Fund subscription flow is admin-initiated only
- No OCR / automated document parsing (Phase 4)
- No email notifications for task assignments
- Notifications only fire for document review and status changes — not for task assignments, condition additions, or underwriting decisions yet

---

## 11. Phase 4 — Workflow Automation

### n8n Webhook (`POST /api/webhooks/n8n`)

- [ ] Request without `X-N8N-Signature` header returns 401
- [ ] Request with invalid HMAC signature returns 401
- [ ] Valid `create_task` action with correct signature creates a task
- [ ] Valid `send_notification` action creates a notification for the recipient
- [ ] Invalid action payload returns 400 with details

---

*Last updated: 2026-03-19*
