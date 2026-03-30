import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow remote machines on the local network to access the dev server
  // (Next.js 16 blocks cross-origin requests to /_next/* by default)
  allowedDevOrigins: ["192.168.35.42", "96.230.35.5"],
  experimental: {
    serverActions: {
      allowedOrigins: ["192.168.35.42", "96.230.35.5", "96.230.35.5:8090"],
    },
  },
};

export default nextConfig;
