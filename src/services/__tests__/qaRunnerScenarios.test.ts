import { describe, it, expect } from "vitest";
import { runScenario } from "../../lib/testRunner.ts";
import { TEST_SCENARIOS } from "../../lib/testScenarios.ts";

describe("QA Test Runner Scenarios Verification", () => {
  TEST_SCENARIOS.forEach((scenario) => {
    it(`executes ${scenario.name} cleanly with zero errors`, async () => {
      const result = await runScenario(scenario);
      if (!result.passed) {
        console.error(`Scenario failed [${scenario.id}]:`, result.errors);
      }
      expect(result.errors).toEqual([]);
      expect(result.passed).toBe(true);
    }, 30000);
  });
});
