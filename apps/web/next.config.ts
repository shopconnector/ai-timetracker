import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("./package.json");

const nextConfig: NextConfig = {
  basePath: "/timetracker",
  assetPrefix: "/timetracker",

  env: {
    NEXT_PUBLIC_BASE_PATH: "/timetracker",
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    // Atlassian OAuth client_secret — injected at build time from GitHub Actions secret.
    // Used ONLY by lib/atlassianOAuth.ts which is imported only by server routes,
    // so this string does not leak into the client bundle.
    ATLASSIAN_OAUTH_CLIENT_SECRET: process.env.ATLASSIAN_OAUTH_CLIENT_SECRET || "",
    // Same pattern for Tempo OAuth client_secret. Tempo OAuth doesn't support PKCE,
    // so secret is required.
    TEMPO_OAUTH_CLIENT_SECRET: process.env.TEMPO_OAUTH_CLIENT_SECRET || "",
  },

  // Standalone output for production deployment without node_modules
  // This creates a minimal self-contained build in .next/standalone
  output: "standalone",
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
