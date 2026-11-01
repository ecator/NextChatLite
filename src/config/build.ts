import packageJson from "../../package.json";
import { DEFAULT_INPUT_TEMPLATE, DEFAULT_SYSTEM_TEMPLATE } from "../constant";
import { getDefaultModel } from "./server";

export const getBuildConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }

  const buildMode = process.env.BUILD_MODE ?? "standalone";
  const isApp = false;
  const version = "v" + (packageJson.version || "2.16.1");

  const commitInfo = (() => {
    try {
      if (typeof window === "undefined") {
        const childProcess = require("child_process");
        const commitDate: string = childProcess
          .execSync('git log -1 --format="%at000" --date=unix')
          .toString()
          .trim();
        const commitHash: string = childProcess
          .execSync('git log --pretty=format:"%H" -n 1')
          .toString()
          .trim();

        return { commitDate, commitHash };
      }
      return {
        commitDate: "unknown",
        commitHash: "unknown",
      };
    } catch (e) {
      return {
        commitDate: "unknown",
        commitHash: "unknown",
      };
    }
  })();

  return {
    version,
    ...commitInfo,
    buildMode,
    isApp,
    defaultModel: getDefaultModel(),
    template:
      process.env.NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE ??
      process.env.DEFAULT_INPUT_TEMPLATE ??
      DEFAULT_INPUT_TEMPLATE,
    defaultSystemTemplate:
      process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE ??
      DEFAULT_SYSTEM_TEMPLATE,
    title: process.env.NEXTCHATLITE_TITLE || "NextChatLite",
    subTitle:
      process.env.NEXTCHATLITE_SUBTITLE || "Build your own AI assistant.",
    helpUrl: process.env.NEXTCHATLITE_HELP_URL?.trim() || undefined,
  };
};

export type BuildConfig = ReturnType<typeof getBuildConfig>;
