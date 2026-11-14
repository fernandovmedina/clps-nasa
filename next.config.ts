import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Un solo renderer WebGL por montaje (StrictMode monta dos veces en dev)
  reactStrictMode: false,
};

export default nextConfig;
