import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";

type MockFirm = {
  id: string;
  name: string;
  complianceOfficerId: string;
};

type MockAdvisor = {
  id: string;
  firmId: string;
  name: string;
  email: string;
  role: "ADVISOR" | "COMPLIANCE_OFFICER";
};

type MockClient = {
  id: string;
  advisorId: string;
  firmId: string;
  name: string;
  email: string;
  accountType: "RRSP" | "TFSA" | "INVESTMENT" | "CORPORATE" | "JOINT";
  onboardingStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "STALLED";
  onboardingStage: number;
  riskProfile: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" | null;
};

type DocOverride = {
  clientId: string;
  type: keyof typeof DOCUMENT_REGISTRY;
  status: "MISSING" | "REQUESTED" | "PENDING_REVIEW" | "VALID" | "EXPIRING_SOON" | "EXPIRED";
  expiryOffsetDays?: number;
  uploadedOffsetDays?: number;
  notes?: string;
};

const MOCK_FIRMS: MockFirm[] = [
  { id: "FIRM-001", name: "Meridian Wealth Management", complianceOfficerId: "ADV-003" },
  { id: "FIRM-002", name: "Pinnacle Investment Dealers", complianceOfficerId: "ADV-003" },
];

const MOCK_ADVISORS: MockAdvisor[] = [
  { id: "ADV-001", firmId: "FIRM-001", name: "Tom Reed", email: "tom.reed@meridianwealth.com", role: "ADVISOR" },
  { id: "ADV-002", firmId: "FIRM-001", name: "Lisa Park", email: "lisa.park@meridianwealth.com", role: "ADVISOR" },
  {
    id: "ADV-003",
    firmId: "FIRM-001",
    name: "James Harrington",
    email: "j.harrington@meridianwealth.com",
    role: "COMPLIANCE_OFFICER",
  },
  { id: "ADV-004", firmId: "FIRM-002", name: "Maria Santos", email: "m.santos@pinnacleid.com", role: "ADVISOR" },
];

const MOCK_CLIENTS: MockClient[] = [
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
  },
];

const DOC_OVERRIDES: DocOverride[] = [
  { clientId: "CLT-002", type: "KYC_FORM", status: "EXPIRING_SOON", expiryOffsetDays: 45 },
  { clientId: "CLT-003", type: "KYC_FORM", status: "EXPIRED", expiryOffsetDays: -60 },
  { clientId: "CLT-004", type: "RISK_QUESTIONNAIRE", status: "REQUESTED", uploadedOffsetDays: -12 },
  { clientId: "CLT-004", type: "CLIENT_AGREEMENT", status: "MISSING" },
  { clientId: "CLT-006", type: "AML_VERIFICATION", status: "MISSING" },
  { clientId: "CLT-007", type: "KYC_FORM", status: "EXPIRING_SOON", expiryOffsetDays: 12 },
  { clientId: "CLT-007", type: "RISK_QUESTIONNAIRE", status: "EXPIRING_SOON", expiryOffsetDays: 10 },
  { clientId: "CLT-007", type: "AML_VERIFICATION", status: "EXPIRING_SOON", expiryOffsetDays: 8 },
  { clientId: "CLT-008", type: "GOVERNMENT_ID", status: "EXPIRED", expiryOffsetDays: -90 },
  { clientId: "CLT-009", type: "FEE_DISCLOSURE", status: "REQUESTED", uploadedOffsetDays: -7 },
  { clientId: "CLT-010", type: "GOVERNMENT_ID", status: "REQUESTED", uploadedOffsetDays: -3 },
  { clientId: "CLT-011", type: "KYC_FORM", status: "EXPIRED", expiryOffsetDays: -35 },
  { clientId: "CLT-011", type: "AML_VERIFICATION", status: "EXPIRED", expiryOffsetDays: -20 },
  { clientId: "CLT-012", type: "RISK_QUESTIONNAIRE", status: "PENDING_REVIEW", uploadedOffsetDays: -1 },
  { clientId: "CLT-013", type: "RISK_QUESTIONNAIRE", status: "EXPIRED", expiryOffsetDays: -10 },
  { clientId: "CLT-013", type: "INVESTMENT_POLICY_STATEMENT", status: "EXPIRED", expiryOffsetDays: -5 },
  { clientId: "CLT-014", type: "BENEFICIARY_DESIGNATION", status: "MISSING" },
];

function addDaysFromDemo(offsetDays: number): Date {
  const base = new Date(env.DEMO_DATE);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base;
}

function docOverrideMap() {
  const map = new Map<string, DocOverride>();
  for (const override of DOC_OVERRIDES) {
    map.set(`${override.clientId}:${override.type}`, override);
  }
  return map;
}

async function seedFirms() {
  for (const firm of MOCK_FIRMS) {
    await prisma.firm.upsert({
      where: { id: firm.id },
      update: {
        name: firm.name,
        complianceOfficerId: firm.complianceOfficerId,
      },
      create: firm,
    });
  }
}

async function seedAdvisors() {
  for (const advisor of MOCK_ADVISORS) {
    await prisma.advisor.upsert({
      where: { id: advisor.id },
      update: {
        firmId: advisor.firmId,
        name: advisor.name,
        email: advisor.email,
        role: advisor.role,
      },
      create: advisor,
    });
  }
}

async function seedClients() {
  for (const client of MOCK_CLIENTS) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: {
        advisorId: client.advisorId,
        firmId: client.firmId,
        name: client.name,
        email: client.email,
        accountType: client.accountType,
        onboardingStatus: client.onboardingStatus,
        onboardingStage: client.onboardingStage,
        riskProfile: client.riskProfile,
      },
      create: client,
    });
  }
}

async function seedDocuments() {
  const overrides = docOverrideMap();
  const allDocumentTypes = Object.keys(DOCUMENT_REGISTRY) as Array<keyof typeof DOCUMENT_REGISTRY>;
  for (const client of MOCK_CLIENTS) {
    for (const docType of allDocumentTypes) {
      const key = `${client.id}:${docType}`;
      const override = overrides.get(key);
      const category = DOCUMENT_REGISTRY[docType].category;
      const status = override?.status ?? "VALID";
      const uploadedAt = override?.uploadedOffsetDays !== undefined ? addDaysFromDemo(override.uploadedOffsetDays) : null;
      const expiryDate = override?.expiryOffsetDays !== undefined ? addDaysFromDemo(override.expiryOffsetDays) : addDaysFromDemo(365);
      const id = `${client.id}-${docType}`;
      await prisma.document.upsert({
        where: { id },
        update: {
          clientId: client.id,
          type: docType,
          category,
          status,
          uploadedAt,
          expiryDate,
          notes: override?.notes,
        },
        create: {
          id,
          clientId: client.id,
          type: docType,
          category,
          status,
          uploadedAt,
          expiryDate,
          notes: override?.notes,
        },
      });
    }
  }
}

async function seedActionHistory() {
  const clt3DocId = "CLT-003-KYC_FORM";
  const clt11DocId = "CLT-011-KYC_FORM";

  const seededRows = [
    {
      id: "ACT-CLT003-1",
      clientId: "CLT-003",
      documentId: clt3DocId,
      agentType: "COMPLIANCE" as const,
      actionType: "NOTIFY_ADVISOR" as const,
      trigger: "SCHEDULED" as const,
      reasoning: "Seeded stage 1 reminder for expired KYC.",
      outcome: "SEEDED_HISTORY",
      performedAt: addDaysFromDemo(-55),
      nextScheduledAt: addDaysFromDemo(-50),
    },
    {
      id: "ACT-CLT003-2",
      clientId: "CLT-003",
      documentId: clt3DocId,
      agentType: "COMPLIANCE" as const,
      actionType: "SEND_CLIENT_REMINDER" as const,
      trigger: "SCHEDULED" as const,
      reasoning: "Seeded stage 2 reminder after no advisor action.",
      outcome: "SEEDED_HISTORY",
      performedAt: addDaysFromDemo(-50),
      nextScheduledAt: addDaysFromDemo(-40),
    },
    {
      id: "ACT-CLT003-3",
      clientId: "CLT-003",
      documentId: clt3DocId,
      agentType: "COMPLIANCE" as const,
      actionType: "SEND_CLIENT_REMINDER" as const,
      trigger: "SCHEDULED" as const,
      reasoning: "Seeded stage 3 reminder after continued inaction.",
      outcome: "SEEDED_HISTORY",
      performedAt: addDaysFromDemo(-40),
      nextScheduledAt: addDaysFromDemo(-30),
    },
    {
      id: "ACT-CLT003-4",
      clientId: "CLT-003",
      documentId: clt3DocId,
      agentType: "COMPLIANCE" as const,
      actionType: "ESCALATE_COMPLIANCE" as const,
      trigger: "SCHEDULED" as const,
      reasoning: "Seeded stage 4 escalation due to unresolved issue.",
      outcome: "SEEDED_HISTORY",
      performedAt: addDaysFromDemo(-30),
      nextScheduledAt: addDaysFromDemo(0),
    },
    {
      id: "ACT-CLT011-1",
      clientId: "CLT-011",
      documentId: clt11DocId,
      agentType: "COMPLIANCE" as const,
      actionType: "ESCALATE_COMPLIANCE" as const,
      trigger: "SCHEDULED" as const,
      reasoning: "Seeded stage 4 escalation record for management escalation scenario.",
      outcome: "SEEDED_HISTORY",
      performedAt: addDaysFromDemo(-10),
      nextScheduledAt: addDaysFromDemo(0),
    },
  ];

  for (const row of seededRows) {
    await prisma.agentAction.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }
}

/**
 * Seeds the full Cerebro baseline dataset using idempotent upserts.
 */
export async function runSeed() {
  await seedFirms();
  await seedAdvisors();
  await seedClients();
  await seedDocuments();
  await seedActionHistory();

  console.log(`
--- Seed Summary ---
✓ Firms: ${MOCK_FIRMS.length}
✓ Advisors: ${MOCK_ADVISORS.length}
✓ Clients: ${MOCK_CLIENTS.length}
✓ Documents: ${MOCK_CLIENTS.length * Object.keys(DOCUMENT_REGISTRY).length}
✓ Actions: 5 (Pre-populated)
--------------------
`);
}

const isDirectRun = process.argv[1]?.endsWith("prisma/seed.ts");

if (isDirectRun) {
  runSeed()
    .then(async () => {
      await prisma.$disconnect();
      console.log("Seed complete.");
    })
    .catch(async (error: unknown) => {
      console.error("Seed failed:", error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
