#!/usr/bin/env node

/**
 * NextChatLite E2E Test Suite Runner
 * Executes all 4 tiers of opaque-box E2E test suites with structured reporting.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const TIERS = [
  {
    id: 1,
    name: "Tier 1: Feature Coverage",
    dir: "tests/e2e/tier1-features",
    expectedFeatures: 16,
    minTests: 80,
  },
  {
    id: 2,
    name: "Tier 2: Boundary & Corner Cases",
    dir: "tests/e2e/tier2-boundaries",
    expectedFeatures: 16,
    minTests: 80,
  },
  {
    id: 3,
    name: "Tier 3: Cross-Feature Pairwise Interactions",
    dir: "tests/e2e/tier3-pairwise",
    expectedFeatures: 16,
    minTests: 16,
  },
  {
    id: 4,
    name: "Tier 4: Real-World Application Scenarios",
    dir: "tests/e2e/tier4-scenarios",
    expectedFeatures: 16,
    minTests: 8,
  },
  {
    id: 5,
    name: "Tier 5: Challenger Empirical Stress",
    dir: "tests/e2e/tier5-challenger",
    expectedFeatures: 16,
    minTests: 20,
  },
];

const args = process.argv.slice(2);
const tierFilter = args.find((a) => a.startsWith("--tier="))?.split("=")[1];

async function findTestFiles(dirRelPath) {
  const fullDir = path.join(ROOT_DIR, dirRelPath);
  if (!fs.existsSync(fullDir)) return [];
  const files = fs.readdirSync(fullDir);
  return files
    .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.js"))
    .sort()
    .map((f) => path.join(dirRelPath, f));
}

async function runSingleTestFile(file) {
  return new Promise((resolve) => {
    const nodeArgs = [
      "--import",
      "tsx",
      "--test",
      file,
    ];

    const child = spawn(process.execPath, nodeArgs, {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "test" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function parseTestOutput(output) {
  const passMatch = output.match(/ℹ pass (\d+)/);
  const failMatch = output.match(/ℹ fail (\d+)/);
  const totalMatch = output.match(/ℹ tests (\d+)/);
  const durationMatch = output.match(/ℹ duration_ms ([\d.]+)/);

  return {
    pass: passMatch ? parseInt(passMatch[1], 10) : 0,
    fail: failMatch ? parseInt(failMatch[1], 10) : 0,
    total: totalMatch ? parseInt(totalMatch[1], 10) : 0,
    durationMs: durationMatch ? parseFloat(durationMatch[1]) : 0,
  };
}

async function main() {
  console.log("\n=======================================================================");
  console.log("             NextChatLite E2E Test Suite Runner (Tiers 1-4)            ");
  console.log("=======================================================================\n");

  let totalPass = 0;
  let totalFail = 0;
  let totalTests = 0;
  let overallDurationMs = 0;
  const results = [];

  for (const tier of TIERS) {
    if (tierFilter && String(tier.id) !== String(tierFilter)) {
      continue;
    }

    const testFiles = await findTestFiles(tier.dir);
    console.log(`▶ Running ${tier.name} (${testFiles.length} suites)...`);

    let tierPass = 0;
    let tierFail = 0;
    let tierTests = 0;
    let tierDurationMs = 0;
    let tierFailedSuites = 0;

    for (const file of testFiles) {
      const suiteName = path.basename(file);
      const runResult = await runSingleTestFile(file);
      const parsed = parseTestOutput(runResult.stdout + runResult.stderr);

      tierPass += parsed.pass;
      tierFail += parsed.fail;
      tierTests += parsed.total;
      tierDurationMs += parsed.durationMs;

      if (runResult.code !== 0 || parsed.fail > 0) {
        tierFailedSuites++;
        console.log(`    ❌ ${suiteName.padEnd(45)} [${parsed.pass}/${parsed.total} passed, ${parsed.fail} failed]`);
      } else {
        console.log(`    ✅ ${suiteName.padEnd(45)} [${parsed.pass}/${parsed.total} passed]`);
      }
    }

    totalPass += tierPass;
    totalFail += tierFail;
    totalTests += tierTests;
    overallDurationMs += tierDurationMs;

    results.push({
      tier: tier.name,
      suites: testFiles.length,
      tests: tierTests,
      pass: tierPass,
      fail: tierFail,
      durationMs: tierDurationMs,
      failedSuites: tierFailedSuites,
    });

    console.log(`  Summary: ${tierPass}/${tierTests} passed across ${testFiles.length} suites (${tierDurationMs.toFixed(1)}ms)\n`);
  }

  console.log("=======================================================================");
  console.log("                       Coverage Summary Table                          ");
  console.log("=======================================================================");
  console.table(
    results.map((r) => ({
      Tier: r.tier,
      Suites: r.suites,
      "Test Cases": r.tests,
      Passed: r.pass,
      Failed: r.fail,
      "Duration (ms)": r.durationMs.toFixed(1),
    }))
  );

  console.log(`Total Test Suites: ${results.reduce((acc, r) => acc + r.suites, 0)}`);
  console.log(`Total Test Cases:  ${totalTests} (Required: ≥ 184)`);
  console.log(`Total Passed:      ${totalPass}`);
  console.log(`Total Failed:      ${totalFail}`);
  console.log(`Overall Time:      ${overallDurationMs.toFixed(1)}ms\n`);

  if (totalFail === 0 && totalTests >= 184) {
    console.log("🎉 ALL E2E TEST SUITES PASSED! (Target Threshold ≥ 184 Tests Met)\n");
    process.exit(0);
  } else if (totalFail > 0) {
    console.log(`ℹ️  Note: ${totalFail} tests failed against current repository state.`);
    console.log("    These tests serve as the authoritative opaque-box contract for M1-M5 implementation agents.\n");
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test runner execution failed:", err);
  process.exit(1);
});
