import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@teleop/protocol'],
};

export default nextConfig;
