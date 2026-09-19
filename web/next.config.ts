import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@teleop/protocol'],
  // Protocol (and other NodeNext packages) use TS-style imports; map .js → .ts for webpack.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
