
# CLAUDE_App_UI.md — Application UI / Product Interface Rules

This file defines design and frontend execution standards for **application interfaces**, including:

- investor portal
- borrower portal
- underwriting workspace
- admin console
- servicing dashboards
- fund management views
- compliance and reporting tools

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

Every application screen should follow a predictable structure.

Standard layout:

```
Top Navigation / App Header
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

Navigation must remain stable across the platform.

Typical primary navigation:

- Dashboard
- Borrowers
- Loans
- Investors
- Funds
- Documents
- Tasks
- Reports
- Settings

Guidelines:

- persistent sidebar navigation
- clear active state
- collapsible on smaller screens
- icons optional but consistent

Never move core navigation between screens.

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

# 6. Workflow Visualization

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

# 7. Data Tables

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

- loading state
- empty state
- error state

---

# 8. Summary Metric Cards

Every operational dashboard should start with **high level metrics**.

Example cards:

- Active Loans
- Total Outstanding Principal
- Delinquent Loans
- Investor Capital Deployed
- Current NAV

Card design:

- clear label
- large value
- contextual indicator if applicable
- optional delta or trend

Avoid cluttering cards with too many details.

---

# 9. Forms for Operational Workflows

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

# 10. Document Handling UI

The platform will handle significant document flows.

Required UI elements:

- upload progress indicators
- document preview
- file type icons
- version history
- verification status

Statuses may include:

- uploaded
- processing
- verified
- rejected
- expired

Users must always know document state.

---

# 11. Activity Timeline

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

# 12. Error and Empty States

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

# 13. Real-Time Updates

Some workflows run asynchronously.

Examples:

- document verification
- credit pulls
- compliance checks
- payment processing

The UI must support:

- polling
- websocket updates
- status refresh buttons
- visible processing indicators

Users must never wonder if the system froze.

---

# 14. Role-Based Interfaces

Different users require different views.

Roles may include:

- borrower
- investor
- analyst
- admin
- compliance officer

The UI should:

- hide irrelevant actions
- display role-specific data
- simplify the interface for each role

Never expose unnecessary controls.

---

# 15. Security Visibility

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

# 16. Performance Considerations

Heavy dashboards must remain responsive.

UI strategies:

- skeleton loading
- incremental loading
- lazy loaded tables
- async background tasks
- caching where appropriate

Avoid blocking UI during long operations.

---

# 17. Accessibility

Application interfaces must support:

- keyboard navigation
- visible focus states
- readable contrast
- semantic structure
- accessible form labels

Operational tools are often used for long sessions — accessibility improves usability.

---

# 18. Consistency Rules

Across the entire application:

- button styles remain consistent
- status badge colors remain consistent
- icons remain consistent
- spacing rhythm remains consistent

If a pattern works once, reuse it.

Do not redesign UI patterns page by page.

---

# 19. QA Checklist

Before considering a UI complete:

Visual

- hierarchy is clear
- spacing consistent
- typography readable

Functional

- workflows are understandable
- statuses visible
- forms validated properly

System

- patterns reused
- components consistent
- UI scalable to additional modules

---

# 20. Final Principle

This platform manages **money, compliance, and operational workflows**.

The UI must feel:

- trustworthy
- clear
- predictable
- resilient
- professional

Users should always feel **in control of the system**, not confused by it.
