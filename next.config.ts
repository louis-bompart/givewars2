import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: "/gw2-render/:path*",
        destination: "https://render.guildwars2.com/:path*",
      },
    ];
  },
};

export default nextConfig;
