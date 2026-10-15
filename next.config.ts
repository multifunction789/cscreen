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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
