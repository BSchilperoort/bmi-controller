export function parseIndices(str: string): number[] {
  return str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
}

export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.detail === 'string') return e.detail
    if (typeof e.title === 'string') return e.title
  }
  return String(err)
}
