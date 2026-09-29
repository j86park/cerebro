import { ensureMastraStorageInitialized, mastraPostgres } from "@/lib/mastra-postgres";

ensureMastraStorageInitialized()
  .then(() => console.log("Mastra storage initialized"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mastraPostgres.getPool().end();
  });
