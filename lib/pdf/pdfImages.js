// PDF → JPEG pictures (one per page) so a document can be sent to LINE as images
// instead of a link. Server-side only (mupdf WebAssembly).
import * as mupdf from 'mupdf'

const MAX_PAGES = 4            // LINE allows 5 messages per request; 1 is kept for the caption
const MAX_BYTES = 9_500_000    // LINE limit for an image: 10 MB
const PREVIEW_BYTES = 950_000  // LINE limit for the preview: 1 MB

/** lowest drawn point (in PDF points) above the page footer band; a 1-page document is cut there so the
 *  picture in the chat is not mostly blank paper */
function contentBottom(page, height) {
  const s = 0.5
  const pix = page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true)
  try {
    const px = pix.getPixels(), stride = pix.getStride(), w = pix.getWidth(), n = pix.getNumberOfComponents()
    for (let y = Math.floor(height * 0.93 * s); y > 0; y--) {
      for (let x = 0; x < w; x++) {
        const o = y * stride + x * n
        if (px[o] < 235 || px[o + 1] < 235 || px[o + 2] < 235) return y / s
      }
    }
    return height
  } finally { pix.destroy?.() }
}

function jpeg(page, scale, quality, cropHeight) {
  let pix
  if (cropHeight) {
    const [x0] = page.getBounds()
    const width = page.getBounds()[2] - x0
    pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, Math.ceil(width * scale), Math.ceil(cropHeight * scale)], false)
    pix.clear(255)
    const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pix)
    page.run(dev, mupdf.Matrix.identity)
    dev.close()
  } else pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
  try { return { bytes: Buffer.from(pix.asJPEG(quality, false)), width: pix.getWidth(), height: pix.getHeight() } }
  finally { pix.destroy?.() }
}

/**
 * @param {Buffer|Uint8Array} pdf
 * @returns {{ pages: number, images: { full: Buffer, preview: Buffer, width: number, height: number }[] }}
 *   full ≈ 1650px wide (sharp enough to zoom into small print), preview ≈ 600px.
 */
export function pdfToImages(pdf) {
  const doc = mupdf.Document.openDocument(pdf, 'application/pdf')
  try {
    const pages = doc.countPages()
    const images = []
    for (let i = 0; i < Math.min(pages, MAX_PAGES); i++) {
      const page = doc.loadPage(i)
      try {
        const [x0, y0, x1, y1] = page.getBounds()
        const w = x1 - x0, h = y1 - y0                          // points (A4 = 595 × 842)
        let crop = null
        if (pages === 1) { const b = contentBottom(page, h) + 28; if (b < h * 0.85) crop = Math.max(b, w * 0.6) }
        let full = jpeg(page, 1650 / w, 85, crop)
        if (full.bytes.length > MAX_BYTES) full = jpeg(page, 1200 / w, 75, crop)
        let preview = jpeg(page, 600 / w, 75, crop)
        if (preview.bytes.length > PREVIEW_BYTES) preview = jpeg(page, 400 / w, 60, crop)
        images.push({ full: full.bytes, preview: preview.bytes, width: full.width, height: full.height })
      } finally { page.destroy?.() }
    }
    return { pages, images }
  } finally { doc.destroy?.() }
}
