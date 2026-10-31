import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/tests/unit/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default async () => {
  const jestConfig = await createJestConfig(config)();
  return {
    ...jestConfig,
    transformIgnorePatterns: [
      "/node_modules/(?!(\\.pnpm|nanoid|lodash-es|@ai-sdk|ai|react-markdown|@opencode-ai))",
    ],
  };
};
