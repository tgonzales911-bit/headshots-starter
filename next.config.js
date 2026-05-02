/** @type {import('next').NextConfig} */
const nextConfig = {
  output: undefined,
  experimental: {
    esmExternals: "loose",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.fal.media",
      },
      {
        protocol: "https",
        hostname: "**.fal.ai",
      },
    ],
  },
};

module.exports = nextConfig;
