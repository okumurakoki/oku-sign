// 署名者ごとの色分け（配置エディタ・署名画面で共通利用）
export const SIGNER_COLORS = [
  { name: 'blue', border: '#2563eb', bg: 'rgba(37,99,235,0.12)', text: '#1d4ed8', dot: '#2563eb' },
  { name: 'green', border: '#16a34a', bg: 'rgba(22,163,74,0.12)', text: '#15803d', dot: '#16a34a' },
  { name: 'orange', border: '#ea580c', bg: 'rgba(234,88,12,0.12)', text: '#c2410c', dot: '#ea580c' },
  { name: 'purple', border: '#7c3aed', bg: 'rgba(124,58,237,0.12)', text: '#6d28d9', dot: '#7c3aed' },
  { name: 'pink', border: '#db2777', bg: 'rgba(219,39,119,0.12)', text: '#be185d', dot: '#db2777' },
] as const

export function signerColor(index: number) {
  return SIGNER_COLORS[index % SIGNER_COLORS.length]
}
