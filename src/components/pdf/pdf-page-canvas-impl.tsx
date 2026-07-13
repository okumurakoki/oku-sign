'use client'

import { useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// pdf.js worker はローカルに自己ホスト（外部CDN禁止：CSP/オフライン対応）
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const PDF_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
}

export interface PageDimensions {
  page: number
  width: number
  height: number
}

interface Props {
  fileUrl: string
  pageWidth?: number
  onPagesRendered?: (pages: PageDimensions[]) => void
  // 各ページ領域に重ねるオーバーレイ（署名欄など）。pageは1始まり
  renderPageOverlay?: (page: number, dims: { width: number; height: number }) => React.ReactNode
  className?: string
}

// PDFを全ページ縦並びで描画し、各ページ上にオーバーレイを重ねられる共通コンポーネント
export function PdfPageCanvas({
  fileUrl,
  pageWidth = 640,
  onPagesRendered,
  renderPageOverlay,
  className,
}: Props) {
  const [numPages, setNumPages] = useState(0)
  const [dims, setDims] = useState<Record<number, PageDimensions>>({})
  const [loadedUrl, setLoadedUrl] = useState(fileUrl)

  // fileUrl が変わったらページ情報をリセット（レンダー中の状態調整：React推奨パターン）
  if (fileUrl !== loadedUrl) {
    setLoadedUrl(fileUrl)
    setNumPages(0)
    setDims({})
  }

  useEffect(() => {
    if (numPages > 0 && Object.keys(dims).length === numPages && onPagesRendered) {
      onPagesRendered(Object.values(dims).sort((a, b) => a.page - b.page))
    }
  }, [dims, numPages, onPagesRendered])

  return (
    <div className={className}>
      <Document
        file={fileUrl}
        options={PDF_OPTIONS}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div className="py-20 text-center text-sm text-muted-foreground">PDFを読み込み中...</div>}
        error={<div className="py-20 text-center text-sm text-red-600">PDFの読み込みに失敗しました</div>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => {
          const d = dims[pageNumber]
          return (
            <div key={pageNumber} className="relative mx-auto mb-4 w-fit shadow-sm" data-pdf-page={pageNumber}>
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onRenderSuccess={(page) => {
                  setDims((prev) =>
                    prev[pageNumber]?.width === page.width && prev[pageNumber]?.height === page.height
                      ? prev
                      : { ...prev, [pageNumber]: { page: pageNumber, width: page.width, height: page.height } },
                  )
                }}
              />
              {renderPageOverlay && d && (
                <div className="absolute left-0 top-0" style={{ width: d.width, height: d.height }}>
                  {renderPageOverlay(pageNumber, { width: d.width, height: d.height })}
                </div>
              )}
            </div>
          )
        })}
      </Document>
    </div>
  )
}
