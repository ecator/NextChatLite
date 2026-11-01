#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const API_URL = "https://models.dev/api.json?type=all";

export function printHelp() {
  console.log(`
Usage:
  node scripts/fetch-providers.mjs [options]
  node scripts/fetch-providers.mjs [provider] [model] [output]

Options:
  -p, --provider <regex>   Filter providers by top-level key/id (case-insensitive regex)
  -m, --model <regex>      Filter models inside each provider by model id (case-insensitive regex)
  -o, --output <file>      Output file path (prints to stdout if omitted)
  -h, --help               Show this help message

Examples:
  node scripts/fetch-providers.mjs --provider "^google$" --model "flash" -o public/providers.json
  node scripts/fetch-providers.mjs "^(google|openai)$" "" public/providers.json
  node scripts/fetch-providers.mjs --provider "anthropic"
`);
}

export function parseArgs(args) {
  let provider;
  let model;
  let output;
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith("--provider=")) {
      provider = arg.slice("--provider=".length);
    } else if (arg === "--provider" || arg === "-p") {
      provider = args[++i];
    } else if (arg.startsWith("-p=")) {
      provider = arg.slice("-p=".length);
    } else if (arg.startsWith("provider=")) {
      provider = arg.slice("provider=".length);
    } else if (arg.startsWith("--model=")) {
      model = arg.slice("--model=".length);
    } else if (arg === "--model" || arg === "-m") {
      model = args[++i];
    } else if (arg.startsWith("-m=")) {
      model = arg.slice("-m=".length);
    } else if (arg.startsWith("model=")) {
      model = arg.slice("model=".length);
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg === "--output" || arg === "-o") {
      output = args[++i];
    } else if (arg.startsWith("-o=")) {
      output = arg.slice("-o=".length);
    } else if (arg.startsWith("output=")) {
      output = arg.slice("output=".length);
    } else {
      positionals.push(arg);
    }
  }

  // Fallback to positional arguments if not set via flags:
  // 1st positional: provider
  // 2nd positional: model
  // 3rd positional: output
  if (provider === undefined && positionals.length > 0) {
    provider = positionals.shift();
  }
  if (model === undefined && positionals.length > 0) {
    model = positionals.shift();
  }
  if (output === undefined && positionals.length > 0) {
    output = positionals.shift();
  }

  return {
    provider: provider && provider.trim() !== "" ? provider.trim() : undefined,
    model: model && model.trim() !== "" ? model.trim() : undefined,
    output: output && output.trim() !== "" ? output.trim() : undefined,
  };
}

export async function fetchAllProviders(url = API_URL) {
  const fetchFn = typeof fetch === "function" ? fetch : (await import("node-fetch")).default;
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch from ${url}: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export function filterProviders(rawData, { provider, model } = {}) {
  let providerRegex = null;
  if (provider) {
    try {
      providerRegex = new RegExp(provider, "i");
    } catch (err) {
      throw new Error(`Invalid regular expression for provider: "${provider}" - ${err.message}`);
    }
  }

  let modelRegex = null;
  if (model) {
    try {
      modelRegex = new RegExp(model, "i");
    } catch (err) {
      throw new Error(`Invalid regular expression for model: "${model}" - ${err.message}`);
    }
  }

  const result = [];

  for (const [key, providerData] of Object.entries(rawData || {})) {
    const providerId = providerData?.id || key;
    if (providerRegex && !providerRegex.test(key) && !providerRegex.test(providerId)) {
      continue;
    }

    if (modelRegex) {
      const filteredModels = {};
      const originalModels = providerData?.models;

      if (originalModels && typeof originalModels === "object") {
        for (const [modelKey, modelItem] of Object.entries(originalModels)) {
          const modelId = modelItem?.id || modelKey;
          if (modelRegex.test(modelKey) || modelRegex.test(modelId)) {
            filteredModels[modelKey] = modelItem;
          }
        }
      }

      // If filtering by model and no models matched for this provider, omit provider
      if (Object.keys(filteredModels).length === 0) {
        continue;
      }

      result.push({
        ...providerData,
        models: filteredModels,
      });
    } else {
      result.push({
        ...providerData,
      });
    }
  }

  return result;
}

export async function main() {
  const { provider, model, output } = parseArgs(process.argv.slice(2));

  if (output) {
    console.error(`[Fetch] Fetching providers from ${API_URL}...`);
    if (provider) {
      console.error(`[Fetch] Filtering providers by regex: /${provider}/i`);
    }
    if (model) {
      console.error(`[Fetch] Filtering models by regex: /${model}/i`);
    }
  }

  let rawData;
  try {
    rawData = await fetchAllProviders();
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = filterProviders(rawData, { provider, model });
  } catch (err) {
    console.error(`[Error] ${err.message}`);
    process.exit(1);
  }

  const jsonOutput = JSON.stringify(result, null, 2) + "\n";

  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, jsonOutput, "utf8");
    console.error(`[Fetch] Successfully wrote ${result.length} provider(s) to ${output}`);
  } else {
    process.stdout.write(jsonOutput);
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error("[Fatal Error]", err);
    process.exit(1);
  });
}
