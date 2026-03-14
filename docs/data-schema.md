# Cerebro — Data Schema

> Reference this document when building the Prisma schema, seed script, and any
> code that reads or writes vault data. All mock data structures are defined here.

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Enums](#2-enums)
3. [Document Type Registry](#3-document-type-registry)
4. [Mock Firm & Advisor Data](#4-mock-firm--advisor-data)
5. [Mock Client Profiles — All 15](#5-mock-client-profiles--all-15)
6. [Document States Per Client](#6-document-states-per-client)
7. [Pre-Populated Action Logs](#7-pre-populated-action-logs)
8. [Onboarding Stage Requirements](#8-onboarding-stage-requirements)
9. [Simulation Data Distributions](#9-simulation-data-distributions)

---

## 1. Database Schema

### Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Firm {
  id                  String    @id @default(cuid())
  name                String
  complianceOfficerId String
  complianceOfficer   Advisor   @relation("ComplianceOfficer", fields: [complianceOfficerId], references: [id])
  advisors            Advisor[] @relation("FirmAdvisors")
  clients             Client[]
  createdAt           DateTime  @default(now())
}

model Advisor {
  id                String   @id @default(cuid())
  firmId            String
  firm              Firm     @relation("FirmAdvisors", fields: [firmId], references: [id])
  name              String
  email             String   @unique
  role              AdvisorRole @default(ADVISOR)
  clients           Client[]
  complianceFirms   Firm[]   @relation("ComplianceOfficer")
  createdAt         DateTime @default(now())
}

model Client {
  id               String          @id @default(cuid())
  advisorId        String
  advisor          Advisor         @relation(fields: [advisorId], references: [id])
  firmId           String
  firm             Firm            @relation(fields: [firmId], references: [id])
  name             String
  email            String          @unique
  accountType      AccountType
  onboardingStatus OnboardingStatus @default(NOT_STARTED)
  onboardingStage  Int             @default(0)
  riskProfile      RiskProfile?
  createdAt        DateTime        @default(now())
  documents        Document[]
  agentActions     AgentAction[]
}

model Document {
  id                String         @id @default(cuid())
  clientId          String
  client            Client         @relation(fields: [clientId], references: [id])
  type              DocumentType
  category          DocumentCategory
  status            DocumentStatus @default(MISSING)
  uploadedAt        DateTime?
  expiryDate        DateTime?
  notificationCount Int            @default(0)
  lastNotifiedAt    DateTime?
  fileRef           String?        // mock file reference
  notes             String?
  agentActions      AgentAction[]
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
}

model AgentAction {
  id              String      @id @default(cuid())
  clientId        String
  client          Client      @relation(fields: [clientId], references: [id])
  documentId      String?
  document        Document?   @relation(fields: [documentId], references: [id])
  agentType       AgentType
  actionType      ActionType
  trigger         TriggerType @default(SCHEDULED)
  reasoning       String      // full agent reasoning — never empty
  outcome         String?     // result after the action
  nextScheduledAt DateTime?   // when agent should check this client again
  performedAt     DateTime    @default(now())

  @@index([clientId, performedAt])
  @@index([agentType, actionType])
}

model SimulationRun {
  id                   String   @id @default(cuid())
  clientCount          Int
  simulatedDays        Int
  clientResponseRate   Float
  advisorResponseRate  Float
  randomSeed           String
  status               SimulationStatus @default(PENDING)
  batchesCompleted     Int      @default(0)
  batchesTotal         Int      @default(0)
  metrics              Json?    // final metrics object
  startedAt            DateTime @default(now())
  completedAt          DateTime?
}

model EvalRun {
  id              String   @id @default(cuid())
  gitCommit       String?
  overallScore    Float
  scenarioResults Json     // array of ScenarioResult objects
  scorerBreakdown Json     // per-scorer averages
  runAt           DateTime @default(now())
}
```

---

## 2. Enums

```typescript
// src/lib/db/enums.ts — mirrors Prisma enums, use these in application code

export const AccountType = {
  RRSP:           "RRSP",
  TFSA:           "TFSA",
  INVESTMENT:     "INVESTMENT",
  CORPORATE:      "CORPORATE",
  JOINT:          "JOINT",
} as const

export const OnboardingStatus = {
  NOT_STARTED:    "NOT_STARTED",
  IN_PROGRESS:    "IN_PROGRESS",
  COMPLETED:      "COMPLETED",
  STALLED:        "STALLED",    // stuck beyond threshold
} as const

export const DocumentStatus = {
  MISSING:         "MISSING",
  REQUESTED:       "REQUESTED",  // agent sent a request, awaiting upload
  PENDING_REVIEW:  "PENDING_REVIEW",
  VALID:           "VALID",
  EXPIRING_SOON:   "EXPIRING_SOON",  // within 30 days
  EXPIRED:         "EXPIRED",
} as const

export const DocumentCategory = {
  IDENTITY:        "IDENTITY",
  COMPLIANCE:      "COMPLIANCE",
  SUITABILITY:     "SUITABILITY",
  LEGAL:           "LEGAL",
  ESTATE:          "ESTATE",
  FUNDING:         "FUNDING",
} as const

export const AgentType = {
  COMPLIANCE:      "COMPLIANCE",
  ONBOARDING:      "ONBOARDING",
} as const

export const ActionType = {
  // Observation (no external effect)
  SCAN_VAULT:              "SCAN_VAULT",
  // Compliance actions
  NOTIFY_ADVISOR:          "NOTIFY_ADVISOR",
  SEND_CLIENT_REMINDER:    "SEND_CLIENT_REMINDER",
  ESCALATE_COMPLIANCE:     "ESCALATE_COMPLIANCE",
  ESCALATE_MANAGEMENT:     "ESCALATE_MANAGEMENT",
  MARK_RESOLVED:           "MARK_RESOLVED",
  // Onboarding actions
  REQUEST_DOCUMENT:        "REQUEST_DOCUMENT",
  VALIDATE_DOCUMENT:       "VALIDATE_DOCUMENT",
  ADVANCE_STAGE:           "ADVANCE_STAGE",
  COMPLETE_ONBOARDING:     "COMPLETE_ONBOARDING",
  ALERT_ADVISOR_STUCK:     "ALERT_ADVISOR_STUCK",
} as const

export const TriggerType = {
  SCHEDULED:       "SCHEDULED",
  EVENT_UPLOAD:    "EVENT_UPLOAD",
  MANUAL:          "MANUAL",
  SIMULATION:      "SIMULATION",
} as const

export const RiskProfile = {
  CONSERVATIVE:    "CONSERVATIVE",
  MODERATE:        "MODERATE",
  AGGRESSIVE:      "AGGRESSIVE",
} as const

export const AdvisorRole = {
  ADVISOR:             "ADVISOR",
  COMPLIANCE_OFFICER:  "COMPLIANCE_OFFICER",
} as const

export const SimulationStatus = {
  PENDING:    "PENDING",
  RUNNING:    "RUNNING",
  COMPLETED:  "COMPLETED",
  FAILED:     "FAILED",
} as const
```

---

## 3. Document Type Registry

All valid document types and their compliance rules. Used by agents and seed script.

```typescript
// src/lib/documents/registry.ts

export const DOCUMENT_REGISTRY = {
  // IDENTITY
  GOVERNMENT_ID: {
    category: "IDENTITY",
    label: "Government Issued ID",
    expiryRuleYears: null,        // expires with the actual ID — use real expiry
    requiredForAll: true,
    onboardingStage: 1,
    regulatoryNote: "Required for identity verification under AML regulations",
  },
  PROOF_OF_ADDRESS: {
    category: "IDENTITY",
    label: "Proof of Address",
    expiryRuleYears: 1,
    requiredForAll: true,
    onboardingStage: 1,
    regulatoryNote: "Must be dated within 12 months",
  },
  SIN_SSN_FORM: {
    category: "IDENTITY",
    label: "SIN / SSN Form",
    expiryRuleYears: null,        // does not expire
    requiredForAll: true,
    onboardingStage: 1,
    regulatoryNote: "Required for CRA / IRS tax reporting",
  },

  // COMPLIANCE
  KYC_FORM: {
    category: "COMPLIANCE",
    label: "Know Your Client Form",
    expiryRuleYears: 3,
    urgencyThresholdDays: [30, 14, 7],
    requiredForAll: true,
    onboardingStage: null,        // existing client doc, not onboarding
    regulatoryNote: "CIRO/FINRA requirement — must be renewed every 3 years minimum",
  },
  AML_VERIFICATION: {
    category: "COMPLIANCE",
    label: "AML Verification",
    expiryRuleYears: 1,
    urgencyThresholdDays: [30, 14, 7],
    requiredForAll: true,
    onboardingStage: null,
    regulatoryNote: "Anti-money laundering — annual renewal required",
  },
  NAAF: {
    category: "COMPLIANCE",
    label: "New Account Application Form",
    expiryRuleYears: null,        // does not expire but must be on file
    requiredForAll: true,
    onboardingStage: 2,
    regulatoryNote: "CIRO requirement for all new accounts",
  },

  // SUITABILITY
  RISK_QUESTIONNAIRE: {
    category: "SUITABILITY",
    label: "Risk Tolerance Questionnaire",
    expiryRuleYears: 2,
    urgencyThresholdDays: [30, 14],
    requiredForAll: true,
    onboardingStage: 2,
    regulatoryNote: "Suitability requirement — must reflect current risk tolerance",
  },
  INVESTMENT_POLICY_STATEMENT: {
    category: "SUITABILITY",
    label: "Investment Policy Statement",
    expiryRuleYears: 2,
    urgencyThresholdDays: [30],
    requiredForAll: false,        // INVESTMENT and CORPORATE accounts only
    accountTypes: ["INVESTMENT", "CORPORATE"],
    onboardingStage: null,
    regulatoryNote: "Defines investment objectives and constraints",
  },
  SUITABILITY_ASSESSMENT: {
    category: "SUITABILITY",
    label: "Suitability Assessment",
    expiryRuleYears: 2,
    urgencyThresholdDays: [30, 14],
    requiredForAll: true,
    onboardingStage: null,
    regulatoryNote: "CIRO requirement — must be updated when client circumstances change",
  },

  // LEGAL
  CLIENT_AGREEMENT: {
    category: "LEGAL",
    label: "Client Agreement",
    expiryRuleYears: null,        // needs re-sign on material changes only
    requiredForAll: true,
    onboardingStage: 2,
    regulatoryNote: "Master agreement governing the advisor-client relationship",
  },
  FEE_DISCLOSURE: {
    category: "LEGAL",
    label: "Fee Disclosure Document",
    expiryRuleYears: 1,
    urgencyThresholdDays: [30],
    requiredForAll: true,
    onboardingStage: 3,
    regulatoryNote: "CRM2 / regulatory requirement — annual disclosure",
  },
  ACCREDITED_INVESTOR_FORM: {
    category: "LEGAL",
    label: "Accredited Investor Declaration",
    expiryRuleYears: 1,
    urgencyThresholdDays: [30, 14],
    requiredForAll: false,
    accountTypes: ["INVESTMENT", "CORPORATE"],
    onboardingStage: null,
    regulatoryNote: "Required for alternative investment eligibility",
  },

  // ESTATE
  BENEFICIARY_DESIGNATION: {
    category: "ESTATE",
    label: "Beneficiary Designation Form",
    expiryRuleYears: null,        // no expiry but flagged if never set
    requiredForAll: true,
    onboardingStage: 3,
    regulatoryNote: "Should be reviewed after major life events",
  },

  // FUNDING
  BANKING_INFORMATION: {
    category: "FUNDING",
    label: "Banking Information",
    expiryRuleYears: null,
    requiredForAll: true,
    onboardingStage: 4,
    regulatoryNote: "Required for account funding and withdrawal processing",
  },
  DEPOSIT_CONFIRMATION: {
    category: "FUNDING",
    label: "Initial Deposit Confirmation",
    expiryRuleYears: null,
    requiredForAll: true,
    onboardingStage: 4,
    regulatoryNote: "Confirms account has been funded and is active",
  },
} as const

export type DocumentType = keyof typeof DOCUMENT_REGISTRY
```

---

## 4. Mock Firm & Advisor Data

```typescript
// Used in prisma/seed.ts

export const MOCK_FIRMS = [
  {
    id: "FIRM-001",
    name: "Meridian Wealth Management",
  },
  {
    id: "FIRM-002",
    name: "Pinnacle Investment Dealers",
  },
]

export const MOCK_ADVISORS = [
  {
    id: "ADV-001",
    firmId: "FIRM-001",
    name: "Tom Reed",
    email: "tom.reed@meridianwealth.com",
    role: "ADVISOR",
  },
  {
    id: "ADV-002",
    firmId: "FIRM-001",
    name: "Lisa Park",
    email: "lisa.park@meridianwealth.com",
    role: "ADVISOR",
  },
  {
    id: "ADV-003",
    firmId: "FIRM-001",
    name: "James Harrington",
    email: "j.harrington@meridianwealth.com",
    role: "COMPLIANCE_OFFICER",  // compliance officer for FIRM-001
  },
  {
    id: "ADV-004",
    firmId: "FIRM-002",
    name: "Maria Santos",
    email: "m.santos@pinnacleid.com",
    role: "ADVISOR",
  },
]
```

---

## 5. Mock Client Profiles — All 15

All dates are offsets from `DEMO_DATE`. The seed script computes actual dates at seed time using `DEMO_DATE`.

```typescript
export const MOCK_CLIENTS = [
  {
    id: "CLT-001",
    name: "Alex Chen",
    email: "alex.chen@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "TFSA",
    onboardingStatus: "IN_PROGRESS",
    onboardingStage: 1,
    riskProfile: null,
    scenario: "Brand new client, day 1, zero documents",
    primaryAgent: "ONBOARDING",
  },
  {
    id: "CLT-002",
    name: "Sarah Mitchell",
    email: "sarah.mitchell@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "INVESTMENT",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "MODERATE",
    scenario: "Active client, KYC expiring in +45 days",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-003",
    name: "Robert Park",
    email: "robert.park@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "RRSP",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "CONSERVATIVE",
    scenario: "KYC expired 60 days ago, advisor ignored stages 1-3 — full escalation",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-004",
    name: "Emma Davis",
    email: "emma.davis@email.com",
    advisorId: "ADV-002",
    firmId: "FIRM-001",
    accountType: "TFSA",
    onboardingStatus: "STALLED",
    onboardingStage: 2,
    riskProfile: null,
    scenario: "Onboarding stuck at stage 2 for 12 days — advisor alert",
    primaryAgent: "ONBOARDING",
  },
  {
    id: "CLT-005",
    name: "Michael Torres",
    email: "michael.torres@email.com",
    advisorId: "ADV-002",
    firmId: "FIRM-001",
    accountType: "INVESTMENT",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "AGGRESSIVE",
    scenario: "Fully compliant, all docs current — baseline, agent monitors quietly",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-006",
    name: "Jennifer Walsh",
    email: "jennifer.walsh@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "RRSP",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "MODERATE",
    scenario: "Missing AML verification — never had one on file",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-007",
    name: "David Kim",
    email: "david.kim@email.com",
    advisorId: "ADV-002",
    firmId: "FIRM-001",
    accountType: "INVESTMENT",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "MODERATE",
    scenario: "Multiple docs expiring within 14 days simultaneously — priority handling",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-008",
    name: "Lisa Patel",
    email: "lisa.patel@email.com",
    advisorId: "ADV-004",
    firmId: "FIRM-002",
    accountType: "RRSP",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "CONSERVATIVE",
    scenario: "Government ID expired 90 days ago",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-009",
    name: "James Robinson",
    email: "james.robinson@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "TFSA",
    onboardingStatus: "IN_PROGRESS",
    onboardingStage: 3,
    riskProfile: "MODERATE",
    scenario: "Onboarding 80% complete, one doc pending for 7 days",
    primaryAgent: "ONBOARDING",
  },
  {
    id: "CLT-010",
    name: "Amanda Foster",
    email: "amanda.foster@email.com",
    advisorId: "ADV-004",
    firmId: "FIRM-002",
    accountType: "CORPORATE",
    onboardingStatus: "IN_PROGRESS",
    onboardingStage: 1,
    riskProfile: null,
    scenario: "New corporate account — larger doc set, day 3 of onboarding",
    primaryAgent: "ONBOARDING",
  },
  {
    id: "CLT-011",
    name: "Chris Nguyen",
    email: "chris.nguyen@email.com",
    advisorId: "ADV-002",
    firmId: "FIRM-001",
    accountType: "INVESTMENT",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "AGGRESSIVE",
    scenario: "Stage 4 escalation — 30 days unresolved, headed to management",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-012",
    name: "Rachel Simmons",
    email: "rachel.simmons@email.com",
    advisorId: "ADV-001",
    firmId: "FIRM-001",
    accountType: "RRSP",
    onboardingStatus: "IN_PROGRESS",
    onboardingStage: 2,
    riskProfile: null,
    scenario: "Just uploaded requested doc — onboarding agent should advance stage",
    primaryAgent: "ONBOARDING",
  },
  {
    id: "CLT-013",
    name: "Thomas Hughes",
    email: "thomas.hughes@email.com",
    advisorId: "ADV-004",
    firmId: "FIRM-002",
    accountType: "INVESTMENT",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "MODERATE",
    scenario: "Risk questionnaire outdated, IPS needs renewal — suitability focus",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-014",
    name: "Nicole Bennett",
    email: "nicole.bennett@email.com",
    advisorId: "ADV-002",
    firmId: "FIRM-001",
    accountType: "TFSA",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "CONSERVATIVE",
    scenario: "Beneficiary never designated — low urgency but flagged",
    primaryAgent: "COMPLIANCE",
  },
  {
    id: "CLT-015",
    name: "Mark Stevenson",
    email: "mark.stevenson@email.com",
    advisorId: "ADV-004",
    firmId: "FIRM-002",
    accountType: "RRSP",
    onboardingStatus: "COMPLETED",
    onboardingStage: 4,
    riskProfile: "MODERATE",
    scenario: "Fully onboarded last week — agent monitoring begins",
    primaryAgent: "COMPLIANCE",
  },
]
```

---

## 6. Document States Per Client

Key date offsets relative to `DEMO_DATE`. Positive = future, negative = past.

| Client | Document | Status | Expiry Offset |
|---|---|---|---|
| CLT-001 Alex Chen | ALL | MISSING | — |
| CLT-002 Sarah Mitchell | KYC_FORM | EXPIRING_SOON | +45 days |
| CLT-002 Sarah Mitchell | All others | VALID | +800 to +1200 days |
| CLT-003 Robert Park | KYC_FORM | EXPIRED | −60 days |
| CLT-003 Robert Park | All others | VALID | +200 to +900 days |
| CLT-004 Emma Davis | Stage 1 docs | VALID | — |
| CLT-004 Emma Davis | RISK_QUESTIONNAIRE | REQUESTED | requested −12 days ago |
| CLT-004 Emma Davis | CLIENT_AGREEMENT | MISSING | — |
| CLT-005 Michael Torres | ALL | VALID | +300 to +1100 days |
| CLT-006 Jennifer Walsh | AML_VERIFICATION | MISSING | — |
| CLT-006 Jennifer Walsh | All others | VALID | +400 to +900 days |
| CLT-007 David Kim | KYC_FORM | EXPIRING_SOON | +12 days |
| CLT-007 David Kim | RISK_QUESTIONNAIRE | EXPIRING_SOON | +10 days |
| CLT-007 David Kim | AML_VERIFICATION | EXPIRING_SOON | +8 days |
| CLT-008 Lisa Patel | GOVERNMENT_ID | EXPIRED | −90 days |
| CLT-008 Lisa Patel | All others | VALID | +200 to +800 days |
| CLT-009 James Robinson | Stage 1-2 docs | VALID | — |
| CLT-009 James Robinson | FEE_DISCLOSURE | REQUESTED | requested −7 days ago |
| CLT-010 Amanda Foster | GOVERNMENT_ID | REQUESTED | requested −3 days ago |
| CLT-010 Amanda Foster | All others | MISSING | — |
| CLT-011 Chris Nguyen | KYC_FORM | EXPIRED | −35 days |
| CLT-011 Chris Nguyen | AML_VERIFICATION | EXPIRED | −20 days |
| CLT-012 Rachel Simmons | Stage 1 docs | VALID | — |
| CLT-012 Rachel Simmons | RISK_QUESTIONNAIRE | PENDING_REVIEW | uploaded 1 hour ago |
| CLT-013 Thomas Hughes | RISK_QUESTIONNAIRE | EXPIRED | −10 days |
| CLT-013 Thomas Hughes | INVESTMENT_POLICY_STATEMENT | EXPIRED | −5 days |
| CLT-014 Nicole Bennett | BENEFICIARY_DESIGNATION | MISSING | — |
| CLT-014 Nicole Bennett | All others | VALID | +600 to +1100 days |
| CLT-015 Mark Stevenson | ALL | VALID | +300 to +1000 days |

---

## 7. Pre-Populated Action Logs

These give CLT-003, CLT-007, CLT-009, and CLT-011 a realistic history so the system
feels like it's been running for weeks, not just installed.

### CLT-003 Robert Park — Full Escalation History

```typescript
[
  {
    agentType: "COMPLIANCE",
    actionType: "NOTIFY_ADVISOR",
    reasoning: "KYC form expired 5 days ago. No previous actions on record. Notifying assigned advisor Tom Reed as first escalation step.",
    performedAt: DEMO_DATE - 55 days,
    nextScheduledAt: DEMO_DATE - 50 days,
  },
  {
    agentType: "COMPLIANCE",
    actionType: "SEND_CLIENT_REMINDER",
    reasoning: "5 days have passed since advisor was notified. No advisor action recorded. Sending direct reminder to client per stage 2 protocol.",
    performedAt: DEMO_DATE - 50 days,
    nextScheduledAt: DEMO_DATE - 40 days,
  },
  {
    agentType: "COMPLIANCE",
    actionType: "SEND_CLIENT_REMINDER",
    reasoning: "10 days since first client reminder. No document uploaded. Sending second reminder and notifying advisor again per stage 3 protocol.",
    performedAt: DEMO_DATE - 40 days,
    nextScheduledAt: DEMO_DATE - 30 days,
  },
  {
    agentType: "COMPLIANCE",
    actionType: "ESCALATE_COMPLIANCE",
    reasoning: "20 days with no resolution. Client has not responded to two reminders. Advisor has not acted. Escalating to compliance officer James Harrington with full case summary.",
    performedAt: DEMO_DATE - 30 days,
    nextScheduledAt: DEMO_DATE - 0 days,  // due NOW — agent should escalate to management
  },
]
```

### CLT-011 Chris Nguyen — At Management Escalation

```typescript
[
  // Similar structure as CLT-003 but progressed further
  // Last action: ESCALATE_COMPLIANCE at DEMO_DATE - 10 days
  // Next action due: TODAY → agent should fire ESCALATE_MANAGEMENT
]
```

---

## 8. Onboarding Stage Requirements

```typescript
// src/lib/documents/onboarding-stages.ts

export const ONBOARDING_STAGES: Record<number, {
  label: string
  requiredDocuments: DocumentType[]
  description: string
}> = {
  1: {
    label: "Identity Verification",
    requiredDocuments: ["GOVERNMENT_ID", "PROOF_OF_ADDRESS", "SIN_SSN_FORM"],
    description: "Verify the client's identity and address for regulatory compliance",
  },
  2: {
    label: "Account Setup",
    requiredDocuments: ["NAAF", "RISK_QUESTIONNAIRE", "CLIENT_AGREEMENT"],
    description: "Establish the formal advisor-client relationship and investment profile",
  },
  3: {
    label: "Compliance & Estate",
    requiredDocuments: ["BENEFICIARY_DESIGNATION", "FEE_DISCLOSURE"],
    description: "Complete compliance documentation and estate planning baseline",
  },
  4: {
    label: "Account Funding",
    requiredDocuments: ["BANKING_INFORMATION", "DEPOSIT_CONFIRMATION"],
    description: "Fund the account and confirm activation",
  },
}

// Stage threshold — if client stuck beyond this, alert advisor
export const STAGE_STUCK_THRESHOLD_DAYS = 7

// Documents required specifically for CORPORATE accounts in addition to above
export const CORPORATE_ADDITIONAL_DOCS: DocumentType[] = [
  "ACCREDITED_INVESTOR_FORM",
  "INVESTMENT_POLICY_STATEMENT",
]
```

---

## 9. Simulation Data Distributions

Used by the synthetic client generator in `src/simulation/generator.ts`.

```typescript
// src/simulation/distributions.ts

export const SIMULATION_DISTRIBUTIONS = {
  // What % of existing clients have at least one expired doc
  expiredDocRate: 0.15,

  // What % have a doc expiring within 90 days
  expiringSoonRate: 0.30,

  // What % are missing a required doc entirely
  missingDocRate: 0.08,

  // Of onboarding clients, what % stall at stage 2+
  onboardingStallRate: 0.05,

  // Default client response probability per reminder
  // 0 = never responds, 1 = always responds immediately
  defaultClientResponseRate: 0.65,

  // Default advisor response probability per alert
  defaultAdvisorResponseRate: 0.70,

  // Average days for a client to respond after a reminder
  clientResponseDelayDays: { min: 1, max: 14, mean: 4 },

  // Distribution of account types in synthetic population
  accountTypeWeights: {
    RRSP: 0.30,
    TFSA: 0.25,
    INVESTMENT: 0.35,
    CORPORATE: 0.07,
    JOINT: 0.03,
  },
}
```
