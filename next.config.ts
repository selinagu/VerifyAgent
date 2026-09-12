import type { NextConfig } from "next";

import { securityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  agentRules: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
};

export default nextConfig;
