import { config as loadEnv } from "dotenv";
import path from "node:path";
import { vi } from "vitest";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// Optional: Global mocks or setup logic
