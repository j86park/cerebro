import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const runs = await prisma.evalRun.findMany({
      orderBy: { runAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: runs });
  } catch (error) {
    console.error("Failed to fetch eval runs:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
