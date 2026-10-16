import type { NextConfig } from "next";

// Header ความปลอดภัยพื้นฐาน — ใส่ทุกหน้า
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },                       // กันเว็บอื่นฝังหน้าระบบใน iframe (clickjacking)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }, // กล้องใช้ถ่ายรูป QC
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF rendering runs on the server: keep react-pdf unbundled and ship the Thai fonts + logo with the routes that use them
  serverExternalPackages: ["@react-pdf/renderer", "mupdf"],
  outputFileTracingIncludes: {
    "/api/inbox/send-quotation": ["./assets/fonts/**/*", "./public/cstyle-apparel-logo.png", "./node_modules/mupdf/dist/mupdf-wasm.wasm"],
    "/api/inbox/send-receipt": ["./assets/fonts/**/*", "./public/cstyle-apparel-logo.png", "./node_modules/mupdf/dist/mupdf-wasm.wasm"],
    "/api/documents/*": ["./assets/fonts/**/*", "./public/cstyle-apparel-logo.png"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
