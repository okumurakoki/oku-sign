'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { PdfPageCanvas as PdfPageCanvasImpl } from './pdf-page-canvas-impl'

export type { PageDimensions } from './pdf-page-canvas-impl'

// react-pdf(pdf.js) はブラウザ専用（DOMMatrix等）のため SSR を無効化して読み込む
const PdfPageCanvasDynamic = dynamic(
  () => import('./pdf-page-canvas-impl').then((m) => m.PdfPageCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="py-20 text-center text-sm text-muted-foreground">PDFビューアを読み込み中...</div>
    ),
  },
)

export function PdfPageCanvas(props: ComponentProps<typeof PdfPageCanvasImpl>) {
  return <PdfPageCanvasDynamic {...props} />
}
