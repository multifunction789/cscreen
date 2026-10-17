import { Suspense } from 'react'
import SalesBoard from '@/components/sales/SalesBoard'

export const metadata = { title: 'งานขาย | CSCREEN' }

export default function SalesPage() {
  return <Suspense fallback={null}><SalesBoard /></Suspense>
}
