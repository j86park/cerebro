import { runAllEvals } from "./src/evals/run";
import { vi } from "vitest";

// Mock everything manually
(global as any).vi = {
    fn: () => {
        const fn = (...args: any[]) => {
            fn.calls.push(args);
            return fn.mockReturnValue;
        };
        fn.calls = [] as any[];
        fn.mockReturnValue = undefined as any;
        fn.mockResolvedValue = (val: any) => { fn.mockReturnValue = Promise.resolve(val); return fn; };
        return fn;
    }
};

async function testManual() {
    console.log("Starting manual test...");
    try {
        const result = await runAllEvals(1);
        console.log("Overall Score:", result.overallScore);
    } catch (e) {
        console.error("MANUAL TEST FAILED:", e);
    }
}

testManual();
