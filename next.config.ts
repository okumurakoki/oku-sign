import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // subset-font/harfbuzzjsはWASMをrequire.resolveで読むためバンドル対象から外す
  serverExternalPackages: ['postgres', 'subset-font', 'harfbuzzjs'],
  // 署名済みPDF生成で使う日本語フォントをサーバーレス関数にバンドルする
  outputFileTracingIncludes: {
    '/api/sign': ['./src/server/pdf/fonts/**', './node_modules/harfbuzzjs/hb-subset.wasm'],
  },
};

export default nextConfig;
