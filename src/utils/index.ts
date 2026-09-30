export function parseIndices(str: string): number[] {
  return str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
}

// Parse comma-separated values for set_value. Entries that aren't numbers are an
// error rather than being dropped, so every value keeps its position. 'NaN' marks
// a missing value (sent as JSON null).
export function parseValues(str: string): number[] | string {
  if (!str.trim()) return 'Enter comma-separated numbers'
  const values: number[] = []
  for (const [i, s] of str.split(',').map(s => s.trim()).entries()) {
    if (/^nan$/i.test(s)) { values.push(NaN); continue }
    const n = Number(s)
    if (s === '' || !Number.isFinite(n)) return `Value ${i + 1} is not a number: "${s}"`
    values.push(n)
  }
  return values
}

// Format values for the set_value input. Missing values (NaN arrives as JSON null)
// are written as 'NaN' so they keep their position.
export function formatValues(values: (number | null)[]): string {
  return values.map(v => (v == null ? 'NaN' : String(v))).join(', ')
}

export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.detail === 'string') return e.detail
    if (typeof e.title === 'string') return e.title
  }
  return String(err)
}
