import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  testMatch: [
    "**/tests/unit/**/*.test.ts",
    "**/tests/unit/**/*.test.js",
    "**/tests/unit/**/*.test.tsx",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

const makeJestConfig = async () => {
  const jestConfig = await createJestConfig(config)();
  return {
    ...jestConfig,
    transformIgnorePatterns: [
      "/node_modules/(?!(\\.pnpm|nanoid|lodash-es|@ai-sdk|ai|react-markdown|@opencode-ai|@workflow))",
    ],
  };
};

export default makeJestConfig;
