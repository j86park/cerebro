import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const REQUIRED_DIRS = [
  "prisma",
  "src/agents",
  "src/tools",
  "src/lib",
  "src/evals",
  "src/simulation",
  "src/app",
  "tests",
  "scripts",
];

async function ensureDir(dir: string): Promise<void> {
  await mkdir(path.resolve(process.cwd(), dir), { recursive: true });
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  try {
    await access(absolutePath, constants.F_OK);
  } catch {
    await writeFile(absolutePath, content, "utf8");
  }
}

async function main(): Promise<void> {
  for (const dir of REQUIRED_DIRS) {
    await ensureDir(dir);
  }

  await ensureFile(".env.example", "DRY_RUN=true\nNODE_ENV=development\n");
  await ensureFile(".env.local", "DRY_RUN=true\nNODE_ENV=development\n");
  await ensureFile(".env.test", "DRY_RUN=true\nNODE_ENV=test\n");

  console.log("Bootstrap complete.");
}

main().catch((error: unknown) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
