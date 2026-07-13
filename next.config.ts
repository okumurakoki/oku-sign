import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres'],
  // 署名済みPDF生成で使う日本語フォントをサーバーレス関数にバンドルする
  outputFileTracingIncludes: {
    '/api/sign': ['./src/server/pdf/fonts/**'],
  },
};

export default nextConfig;
