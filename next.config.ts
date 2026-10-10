import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: almost every screen is per-user, so pages render dynamically
  // when they read the session (see CLAUDE.md "Stack").
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Five listing photos of up to 5 MB each, plus multipart overhead.
    serverActions: { bodySizeLimit: "30mb" },
  },
  serverExternalPackages: ["@prisma/client", "pg"],
};

export default nextConfig;
