import { prisma } from "@/lib/db/client";
import TestingPage, {
  type SerializableEvalRun,
} from "@/app/testing/TestingPage";

// Eval history belongs to the configured runtime database. Rendering this
// route dynamically prevents Next from trying to query Prisma during a
// production build, before DATABASE_URL is available.
export const dynamic = "force-dynamic";

export default async function Page() {
  const runs = await prisma.evalRun.findMany({
    orderBy: { runAt: "desc" },
    take: 50,
  });

  const serializable = JSON.parse(JSON.stringify(runs)) as SerializableEvalRun[];
  return <TestingPage runsInitial={serializable} />;
}
