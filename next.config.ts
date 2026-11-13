import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none';",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const noIndexFollow = [
  {
    key: "X-Robots-Tag",
    value: "noindex, follow",
  },
];

const noIndexNoFollow = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/admin/:path*",
        headers: noIndexNoFollow,
      },
      {
        source: "/booking/:path*",
        headers: noIndexFollow,
      },
      {
        source: "/payment/return/:path*",
        headers: noIndexNoFollow,
      },
      {
        source: "/faq/:path*",
        headers: noIndexFollow,
      },
      {
        source: "/pricing/:path*",
        headers: noIndexFollow,
      },
      {
        source: "/why-effective/:path*",
        headers: noIndexFollow,
      },
      {
        source: "/analytics/:path*",
        headers: noIndexFollow,
      },
    ];
  },
};

export default nextConfig;
