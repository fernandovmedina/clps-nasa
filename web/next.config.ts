import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Un solo renderer WebGL por montaje (StrictMode monta dos veces en dev)
  reactStrictMode: false,
  // Arquitectura serverless del proyecto (CLAUDE.md sec. 5): export estatico
  // servido desde S3 + CloudFront. Sin SSR, server actions, middleware ni
  // route handlers dinamicos - todo lo dinamico vive en la Lambda de /api/*.
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
