import { prisma } from "@/lib/db/client";
import TestingPage, {
  type SerializableEvalRun,
} from "@/app/testing/TestingPage";

export default async function Page() {
  const runs = await prisma.evalRun.findMany({
    orderBy: { runAt: "desc" },
    take: 50,
  });

  const serializable = JSON.parse(JSON.stringify(runs)) as SerializableEvalRun[];
  return <TestingPage runsInitial={serializable} />;
}
