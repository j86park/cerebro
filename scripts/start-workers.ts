import { workers } from "../src/lib/queue/workers";

console.log("--- Cerebro Workers Started ---");
console.log(`- Priority: ${workers.priority.name} (concurrency: 5)`);
console.log(`- Scheduled: ${workers.scheduled.name} (concurrency: 3)`);
console.log(`- Simulation: ${workers.simulation.name} (concurrency: 20)`);

process.on("SIGINT", async () => {
    console.log("Shutting down workers...");
    await Promise.all(Object.values(workers).map(w => w.close()));
    process.exit(0);
});
