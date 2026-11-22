import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隐藏左下角的 Next.js 开发指示器（含 issue 计数按钮）
  devIndicators: false,
  // 允许局域网设备（如手机）在 dev 模式下访问 HMR 等 dev 资源，
  // 否则移动端会因 HMR 连接被拒而反复整页刷新
  allowedDevOrigins: ["192.168.1.16"],
};

export default nextConfig;
