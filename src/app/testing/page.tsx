import { prisma } from "@/lib/db/client";
import TestingPage from "@/app/testing/TestingPage";

export default async function Page() {
  const runs = await prisma.evalRun.findMany({
    orderBy: { runAt: "desc" },
    take: 50,
  });

  // Ensure JSON values from Prisma are serializable or handled
  return <TestingPage runsInitial={JSON.parse(JSON.stringify(runs))} />;
}
