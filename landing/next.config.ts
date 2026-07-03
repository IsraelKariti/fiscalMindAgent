import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // The repo root has its own package-lock.json (the agent backend), which makes
  // Next's lockfile-based root auto-detection pick the wrong directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
