import type { NextConfig } from "next";

// The backend is reached through this app rather than directly from the
// browser. That keeps every request same-origin, which means the session
// cookie is first-party (no SameSite surprises), there is no CORS to
// configure, and a phone on the LAN works with no host-specific config.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const config: NextConfig = {
  // The container carries the server and nothing else: no node_modules, no
  // source. Harmless in development, where it is simply unused.
  output: "standalone",
  images: { unoptimized: true },
  // The dev overlay badge sits bottom-left, on top of the sidebar's Profile
  // and Sign out links, and swallows clicks on them.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default config;
