import "dotenv/config";
import { TEST_SCENARIOS } from "../src/lib/testScenarios.ts";
import { runScenario } from "../src/lib/testRunner.ts";

async function runSmokeTests() {
  console.log("\n🚀 Starting Smoke Tests for Blueprint HVAC AI Voice Assistant...\n");
  console.log("------------------------------------------------------------");

  let passedAll = true;
  const results = [];

  for (const scenario of TEST_SCENARIOS) {
    process.stdout.write(`Testing Scenario: ${scenario.name}... `);
    
    try {
      const result = await runScenario(scenario);
      results.push(result);

      if (result.passed) {
        console.log("✅ PASS");
        console.log(`   - Final Call Type: ${result.capturedData?.call_type}`);
        console.log(`   - Emergency Flag: ${result.capturedData?.emergency_flag ? "YES" : "NO"}`);
        console.log(`   - Required Fields: [${scenario.expected.requiredFields.join(", ")}] captured successfully.`);
      } else {
        console.log(`❌ FAIL (${result.errors.join(", ")})`);
        passedAll = false;
        console.log(`   - Final Call Type: ${result.capturedData?.call_type || "N/A"}`);
        console.log(`   - Emergency Flag: ${result.capturedData?.emergency_flag !== undefined ? (result.capturedData.emergency_flag ? "YES" : "NO") : "N/A"}`);
        console.log("   - Validation Errors:");
        result.errors.forEach(err => console.log(`     • ${err}`));
      }
      console.log(""); // Add spacing between scenarios
    } catch (error) {
      console.log("💥 CRASH");
      console.error(`   - ${error instanceof Error ? error.message : String(error)}`);
      passedAll = false;
    }
  }

  console.log("------------------------------------------------------------");
  console.log(`\nSummary: ${results.filter(r => r.passed).length}/${TEST_SCENARIOS.length} passed.`);

  if (passedAll) {
    console.log("\n✨ ALL TESTS PASSED! Ready for deployment.\n");
    process.exit(0);
  } else {
    console.log("\n⚠️ SOME TESTS FAILED. Please review the errors above.\n");
    process.exit(1);
  }
}

runSmokeTests().catch(err => {
  console.error("\nFatal error during smoke tests:", err);
  process.exit(1);
});
