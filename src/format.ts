// Central Indian Rupee formatter — every displayed financial value in the
// application goes through this so formatting can never drift.
// Uses Indian digit grouping via Intl.NumberFormat('en-IN'): ₹1,00,000 etc.

const inrFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatINR(amount?: number | string | null): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '—'
  return inrFmt.format(n)
}
