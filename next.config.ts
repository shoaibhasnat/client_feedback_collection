import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo / logo / proof uploads go through Server Actions (each image ≤ 8 MB, re-encoded server-side).
    serverActions: { bodySizeLimit: "18mb" },
    proxyClientMaxBodySize: "18mb",
  },
  poweredByHeader: false,
  images: {
    // Public media is served resized in modern formats (brief §8).
    formats: ["image/avif", "image/webp"],
    // Media route URLs are versioned; keep optimized copies briefly so unpublishing takes effect quickly.
    minimumCacheTTL: 300,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // Token links must never leak through referrers or be indexed.
        source: "/(t|invite)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
