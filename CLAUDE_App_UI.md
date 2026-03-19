# CLAUDE_App_UI.md -- Application UI / Product Interface Rules

This file defines design and frontend execution standards for **application interfaces** in the unified portal (`apps/portal`), including:

- borrower portal
- investor portal
- admin console
- underwriter workspace
- servicing dashboard
- manager views

These rules extend `CLAUDE_Web_Design.md` but focus specifically on **complex product interfaces and workflow-heavy systems**.

---

# 1. Core Principle

Application UI is not marketing design.

The priority order is:

1. clarity
2. workflow efficiency
3. system transparency
4. speed of comprehension
5. visual polish

Users must **understand system state immediately**.

---

# 2. App Layout Structure

Every application screen follows a predictable structure.

Standard layout:

```
Top Navigation Bar (role-specific links)
↓
Context Header (page title + primary actions)
↓
Status / Alerts (if applicable)
↓
Summary Metrics
↓
Primary Work Area
↓
Secondary Panels / Activity / History
```

Avoid layouts where users must hunt for important actions.

---

# 3. Navigation Rules

Navigation uses a **top navigation bar** (not a sidebar). The nav bar is persistent across all portal pages.

### Nav bar styling:
- `bg-white border-b border-gray-200`
- Role-specific links rendered based on the authenticated user's role

### Role-specific navigation links:

| Role | Links |
|---|---|
| `borrower` | Dashboard, My Applications, Documents |
| `investor` | Dashboard, Portfolio, Statements |
| `admin` | Dashboard, Applications, Investors, Documents, Underwriting, Invite User |
| `manager` | Dashboard, Applications, Investors, Documents, Invite User |
| `underwriter` | Dashboard, Cases |
| `servicing` | Dashboard, Loans |

### Rules:
- Persistent top nav bar on every authenticated page
- Clear active state on the current link
- Responsive collapse on smaller screens
- Never move core navigation between screens
- Do not convert to a sidebar layout

---

# 4. Page Header Pattern

Every app page should include a **context header**.

Example:

```
Page Title
Short context description

Primary Action
Secondary Actions
```

Example actions:

- Create Loan
- Upload Document
- Add Investor
- Generate Report
- Issue Capital Call

Rules:

- primary action appears top-right
- avoid more than two primary actions
- destructive actions separated or gated

---

# 5. Status Visibility

Users must always understand system state.

Important statuses:

- pending
- processing
- approved
- rejected
- failed
- requires action
- completed

Represent statuses using:

- badges
- progress indicators
- timeline logs
- banners for blocking issues

Never hide critical workflow states.

---

# 6. Established Tailwind Patterns

These are the actual CSS patterns used throughout the portal. **Reuse them consistently.**

### Page layout:
- Page wrapper: `space-y-8`
- Page title: `text-2xl font-semibold text-gray-900`

### Cards:
- `bg-white rounded-xl border border-gray-200 p-6`

### Tables:
- Table: `min-w-full divide-y divide-gray-200`
- Table header: `bg-gray-50`
- Table header text: `text-xs font-semibold text-gray-400 uppercase tracking-wide`
- Table rows: alternating or simple with `divide-y divide-gray-200`

### Status badges:
- Base: `inline-block text-xs px-2 py-0.5 rounded-full font-medium`
- Color semantics:
  - **Green** (`bg-green-100 text-green-700`) -- success, approved, active, paid
  - **Amber** (`bg-amber-100 text-amber-700`) -- warning, pending review, in progress
  - **Red** (`bg-red-100 text-red-700`) -- error, rejected, defaulted, overdue
  - **Blue** (`bg-blue-100 text-blue-700`) -- info, submitted, pending, processing
  - **Gray** (`bg-gray-100 text-gray-600`) -- neutral, closed, draft, inactive

### Buttons:
- Primary: `bg-gray-900 text-white rounded-md hover:bg-gray-700`
- Secondary: `border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50`
- Destructive: `bg-red-600 text-white rounded-md hover:bg-red-700`

### Section headers:
- `text-xs font-semibold text-gray-400 uppercase tracking-wide`

### Detail rows (Section/DetailRow pattern):
- Label left / value right on the same row
- `border-b border-gray-100` between rows
- Label: `text-sm text-gray-500`
- Value: `text-sm text-gray-900 font-medium`

### Empty states:
- Centered text in a card
- Brief explanation of why the page is empty
- Primary action button to create the first item

---

# 7. Workflow Visualization

Many platform operations span multiple steps.

Examples:

- loan underwriting
- investor onboarding
- capital call issuance
- distribution processing

UI patterns to support this:

- step indicators
- activity timeline
- task list
- progress bars
- status chips

Example timeline:

```
Application Submitted
↓
Documents Uploaded
↓
Underwriting Review
↓
Conditional Approval
↓
Funding Scheduled
↓
Loan Funded
```

Users should be able to see **where they are in the process**.

---

# 8. Data Tables

Most app views are table-based.

Required features:

- sortable columns
- filters
- search
- pagination or virtual scroll
- sticky headers

Recommended columns:

- entity name
- status
- date created
- last updated
- owner
- key metric (amount, value, balance)

Tables must handle:

- loading state (skeleton rows)
- empty state (explanation + action)
- error state (explanation + retry)

---

# 9. Summary Metric Cards

Every operational dashboard should start with **high-level metrics**.

Example cards:

- Active Loans
- Total Outstanding Principal
- Delinquent Loans
- Investor Capital Deployed
- Current NAV

Card design:

- `bg-white rounded-xl border border-gray-200 p-6`
- clear label (`text-xs font-semibold text-gray-400 uppercase tracking-wide`)
- large value (`text-2xl font-semibold text-gray-900`)
- contextual indicator if applicable
- optional delta or trend

Avoid cluttering cards with too many details.

---

# 10. Forms for Operational Workflows

Forms must support **long workflows without frustration**.

Design rules:

- group fields into logical sections
- show validation immediately
- preserve inputs after errors
- support document uploads
- allow partial saves when possible

For long forms:

Use **multi-step flows**.

Example:

```
Step 1: Borrower Details
Step 2: Property Details
Step 3: Financial Information
Step 4: Documents
Step 5: Review + Submit
```

Never present extremely long single forms.

---

# 11. Document Handling UI

The platform handles significant document flows (implemented in Phase 3 Step 2).

Required UI elements:

- upload progress indicators
- document preview
- file type icons
- version history
- verification status

Statuses:

- uploaded
- processing
- verified
- rejected
- expired

Users must always know document state.

---

# 12. Activity Timeline

Operational platforms benefit from **audit-friendly activity history**.

Example activity log:

```
09:12 AM  Investor subscribed
09:18 AM  Compliance review started
09:26 AM  Documents verified
10:03 AM  Capital allocated
```

Timeline helps users:

- understand actions taken
- diagnose issues
- audit workflow events

---

# 13. Error and Empty States

Do not leave blank interfaces.

Empty states should explain:

- why the page is empty
- what action to take next

Example:

```
No loans created yet.
Create your first loan to begin managing borrower financing.
[ Create Loan ]
```

Error states must include:

- explanation
- retry option
- support path

---

# 14. Real-Time Updates

Some workflows run asynchronously.

Examples:

- document verification
- credit pulls
- compliance checks
- payment processing

The UI must support:

- polling
- Supabase Realtime (WebSocket subscriptions)
- status refresh buttons
- visible processing indicators

Users must never wonder if the system froze.

---

# 15. Role-Based Interfaces

Six roles require tailored views:

| Role | Focus |
|---|---|
| `borrower` | Loan applications, document uploads, application status |
| `investor` | Portfolio overview, statements, fund participation |
| `admin` | Full platform management, user invites, all workflows |
| `manager` | Same as admin with restricted overrides |
| `underwriter` | Assigned cases, risk assessment, decision recording |
| `servicing` | Loan management, payment recording, draw management |

The UI should:

- hide irrelevant actions per role
- display role-specific data
- simplify the interface for each role

Never expose unnecessary controls.

---

# 16. Security Visibility

For sensitive financial workflows, the UI should surface:

- verification status
- permission boundaries
- audit logs
- sensitive action confirmations

Destructive actions require:

- confirmation dialogs
- clear consequences
- optional multi-step confirmation

---

# 17. Performance Considerations

Heavy dashboards must remain responsive.

UI strategies:

- skeleton loading
- incremental loading
- lazy loaded tables
- async background tasks
- caching where appropriate

Avoid blocking UI during long operations.

---

# 18. Accessibility

Application interfaces must support:

- keyboard navigation
- visible focus states
- readable contrast
- semantic structure
- accessible form labels

Operational tools are often used for long sessions -- accessibility improves usability.

---

# 19. Consistency Rules

Across the entire application:

- button styles remain consistent (see Section 6)
- status badge colors remain consistent (green/amber/red/blue/gray)
- section header style remains consistent
- spacing rhythm remains consistent (`space-y-8` page wrapper, `p-6` cards)

If a pattern works once, reuse it.

Do not redesign UI patterns page by page.

---

# 20. QA Checklist

Before considering a UI complete:

Visual

- hierarchy is clear
- spacing consistent
- typography readable
- Tailwind patterns match Section 6

Functional

- workflows are understandable
- statuses visible with correct badge colors
- forms validated properly
- empty and error states covered

System

- patterns reused from established conventions
- components consistent across roles
- UI scalable to additional modules

---

# 21. Final Principle

This platform manages **money, compliance, and operational workflows**.

The UI must feel:

- trustworthy
- clear
- predictable
- resilient
- professional

Users should always feel **in control of the system**, not confused by it.
