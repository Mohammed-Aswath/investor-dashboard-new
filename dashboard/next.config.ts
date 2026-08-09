import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "path";

// Prefer investor-analytics/.env (parent of this app).
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });
loadEnv({ path: path.join(__dirname, ".env"), quiet: true });

const nextConfig: NextConfig = {
  env: {
    // Expose nothing sensitive to the client.
  },
};

export default nextConfig;
