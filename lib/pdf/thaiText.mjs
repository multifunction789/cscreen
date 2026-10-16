// Thai text preparation for @react-pdf/renderer (phase 1 spike, used from phase 7).
// Verified on a rendered A4 quotation (see PR "Phase 1"):
//   1. U+0E33 SARA AM makes react-pdf drop one trailing character per occurrence
//      → write it as NIKHAHIT + SARA AA (identical look after shaping).
//   2. A tone mark after a below vowel (ปุ่, ปู่, ฝุ่น) is not drawn
//      → put the tone mark first (same rendered result).
//   3. Thai has no spaces between words, and react-pdf hyphenates any non-space
//      break → join Thai words with U+200A, which the bundled Sarabun maps to a
//      zero-width glyph, and register PDF_HYPHENATION so it becomes a break point.
const THAI_RUN = /[฀-๿]+/g
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null
export const WORD_BREAK = ' '

export function prepareThai(text) {
  if (text == null) return ''
  let s = String(text)
    .replace(/ำ/g, 'ํา')
    .replace(/([ุ-ฺ])([่-๋])/g, '$2$1')
  if (segmenter) s = s.replace(THAI_RUN, run => [...segmenter.segment(run)].map(x => x.segment).join(WORD_BREAK))
  return s
}

/** Font.registerHyphenationCallback(PDF_HYPHENATION) */
export const PDF_HYPHENATION = word => word.split(/( )/).filter(Boolean)
