import { runAllEvals } from "./src/evals/run";
import { complianceScenarios } from "./src/evals/scenarios/compliance.eval";

async function debug() {
  try {
    console.log("Starting debug run...");
    // Just run the first one
    const result = await runAllEvals(1); 
    console.log("Success!");
  } catch (e) {
    console.error("FAILED with error:", e);
  }
}

debug();
