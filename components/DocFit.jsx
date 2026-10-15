'use client'
import { useEffect } from 'react'

/**
 * มือถือ: ย่อเอกสาร A4 (#print-area) ให้พอดีความกว้างจอ แทนการล้นจนต้องซูม/เลื่อนทั้งหน้า
 * ตั้งค่าเป็น CSS variable --doc-zoom บน <html> (ไม่แตะ style ของเอกสาร → สำเนาที่ใช้พิมพ์ไม่โดนย่อ)
 */
export default function DocFit() {
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const root = document.documentElement
    let current = 1

    function fit() {
      const el = document.getElementById('print-area')
      if (!el || !mq.matches) {
        if (current !== 1) { root.style.removeProperty('--doc-zoom'); current = 1 }
        return
      }
      const parent = el.parentElement
      const cs = getComputedStyle(parent)
      const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const natural = el.getBoundingClientRect().width / current   // ความกว้างจริงก่อนย่อ
      if (!natural || avail <= 0) return
      const next = Math.min(1, Math.floor((avail / natural) * 1000) / 1000)
      if (Math.abs(next - current) > 0.004) {
        current = next
        root.style.setProperty('--doc-zoom', String(next))
      }
    }

    const main = document.querySelector('main')
    const ro = new ResizeObserver(() => fit())
    if (main) ro.observe(main)
    window.addEventListener('resize', fit)
    mq.addEventListener('change', fit)
    fit()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
      mq.removeEventListener('change', fit)
      root.style.removeProperty('--doc-zoom')
    }
  }, [])
  return null
}
