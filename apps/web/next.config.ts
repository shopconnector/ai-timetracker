import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("./package.json");

const nextConfig: NextConfig = {
  basePath: "/timetracker",
  assetPrefix: "/timetracker",

  env: {
    NEXT_PUBLIC_BASE_PATH: "/timetracker",
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },

  // Standalone output for production deployment without node_modules
  // This creates a minimal self-contained build in .next/standalone
  output: "standalone",
};

export default nextConfig;
