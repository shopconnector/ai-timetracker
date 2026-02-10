import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/timetracker",
  assetPrefix: "/timetracker",

  env: {
    NEXT_PUBLIC_BASE_PATH: "/timetracker",
  },

  // Standalone output for production deployment without node_modules
  // This creates a minimal self-contained build in .next/standalone
  output: "standalone",
};

export default nextConfig;
