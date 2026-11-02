import type { NextConfig } from "next";

const mode = process.env.BUILD_MODE as NextConfig["output"];

const nextConfig: NextConfig = {
  output: mode ?? "standalone",
  agentRules: false,
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
