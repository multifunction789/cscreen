// node lib/pdf/thaiText.test.mjs
import assert from 'node:assert/strict'
import { prepareThai, PDF_HYPHENATION, WORD_BREAK } from './thaiText.mjs'

const strip = s => s.replaceAll(WORD_BREAK, '')
// SARA AM decomposed
assert.equal(strip(prepareThai('จำนวน')), 'จํานวน')
// tone mark moved before below vowel
assert.equal(strip(prepareThai('ปุ่')), 'ปุ่')
assert.equal(strip(prepareThai('ปู่')), 'ปู่')
// marks after above vowels untouched
assert.equal(strip(prepareThai('ที่')), 'ที่')
// Thai words separated, Latin and numbers untouched
assert.ok(prepareThai('ราคานี้รวมค่าบล็อก').includes(WORD_BREAK))
assert.equal(prepareThai('Cotton 100% A3'), 'Cotton 100% A3')
// hyphenation callback turns break points into their own (zero-width) pieces
assert.deepEqual(PDF_HYPHENATION(`ราคา${WORD_BREAK}นี้`), ['ราคา', WORD_BREAK, 'นี้'])
assert.equal(prepareThai(null), '')
console.log('thaiText ok')
