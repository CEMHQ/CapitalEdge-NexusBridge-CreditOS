capitaledge-platform/

│

├── apps/

│   │

│   ├── web-marketing/              # Public website

│   │   ├── pages/

│   │   ├── components/

│   │   ├── styles/

│   │   └── public/

│   │

│   ├── investor-portal/            # Reg A / Reg D investor UI

│   │   ├── dashboard/

│   │   ├── portfolio/

│   │   ├── capital-calls/

│   │   ├── distributions/

│   │   ├── documents/

│   │   └── components/

│   │

│   ├── borrower-portal/            # Loan application / borrower UI

│   │   ├── application/

│   │   ├── document-upload/

│   │   ├── loan-status/

│   │   └── components/

│   │

│   ├── underwriting-console/       # Analyst tools

│   │   ├── borrower-review/

│   │   ├── risk-model/

│   │   ├── document-verification/

│   │   └── decision-engine/

│   │

│   └── admin-console/              # Internal operations

│       ├── funds/

│       ├── investors/

│       ├── loans/

│       ├── servicing/

│       └── compliance/

│

│

├── services/

│   │

│   ├── api-gateway/

│   │   ├── controllers/

│   │   ├── middleware/

│   │   └── routes/

│   │

│   ├── investor-service/

│   │   ├── onboarding/

│   │   ├── accreditation/

│   │   ├── subscriptions/

│   │   └── capital-accounts/

│   │

│   ├── loan-origination-service/

│   │   ├── borrower/

│   │   ├── underwriting/

│   │   ├── approvals/

│   │   └── risk-scoring/

│   │

│   ├── servicing-service/

│   │   ├── payment-processing/

│   │   ├── amortization/

│   │   ├── delinquency/

│   │   └── reporting/

│   │

│   ├── fund-accounting-service/

│   │   ├── nav-engine/

│   │   ├── capital-calls/

│   │   ├── distributions/

│   │   └── investor-ledger/

│   │

│   ├── document-service/

│   │   ├── uploads/

│   │   ├── verification/

│   │   └── storage-adapters/

│   │

│   ├── compliance-service/

│   │   ├── kyc/

│   │   ├── aml/

│   │   ├── accreditation-check/

│   │   └── audit-log/

│   │

│   ├── notification-service/

│   │   ├── email/

│   │   ├── sms/

│   │   └── webhook-events/

│   │

│   └── defi-tokenization-service/

│       ├── rwa-tokenization/

│       ├── wallet-integration/

│       └── smart-contract-adapter/

│

│

├── core/

│   │

│   ├── database/

│   │   ├── schema/

│   │   ├── migrations/

│   │   └── seed-data/

│   │

│   ├── shared-models/

│   │   ├── loan-models/

│   │   ├── investor-models/

│   │   ├── fund-models/

│   │   └── transaction-models/

│   │

│   ├── event-bus/

│   │   ├── events/

│   │   ├── consumers/

│   │   └── producers/

│   │

│   ├── auth/

│   │   ├── jwt/

│   │   ├── roles/

│   │   └── permissions/

│   │

│   ├── ui-components/              # shared UI library

│   │   ├── buttons/

│   │   ├── tables/

│   │   ├── forms/

│   │   ├── cards/

│   │   └── dashboards/

│   │

│   └── design-tokens/

│       ├── colors.ts

│       ├── typography.ts

│       └── spacing.ts

│

│

├── infrastructure/

│   │

│   ├── docker/

│   │   ├── api/

│   │   ├── workers/

│   │   └── services/

│   │

│   ├── terraform/

│   │   ├── aws/

│   │   └── environments/

│   │

│   ├── kubernetes/

│   │   ├── deployments/

│   │   └── services/

│   │

│   └── ci-cd/

│       ├── github-actions/

│       └── pipelines/

│

│

├── compliance/

│   │

│   ├── soc2/

│   │   ├── controls/

│   │   └── audit-evidence/

│   │

│   ├── regA/

│   │   ├── offering-docs/

│   │   └── filing-data/

│   │

│   └── regD/

│       ├── investor-records/

│       └── compliance-checks/

│

│

├── docs/

│   │

│   ├── architecture/

│   ├── workflows/

│   ├── api/

│   ├── underwriting/

│   └── platform-design/

│

│

├── scripts/

│   ├── data-import/

│   ├── migrations/

│   └── dev-tools/

│

│

├── CLAUDE.md

├── CLAUDE\_Web\_Design.md

├── CLAUDE\_App\_UI.md

│

├── package.json

├── turbo.json / nx.json

└── README.md

