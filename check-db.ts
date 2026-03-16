import { prisma } from "./src/lib/db/client";

async function check() {
  const count = await prisma.evalRun.count();
  const latest = await prisma.evalRun.findFirst({ orderBy: { runAt: 'desc' } });
  console.log('Total EvalRuns:', count);
  console.log('Latest Run:', latest);
}

check().catch(console.error).finally(() => prisma.$disconnect());
