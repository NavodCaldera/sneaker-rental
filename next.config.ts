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
  serverExternalPackages: ["@prisma/client", "pg"],
};

export default nextConfig;
