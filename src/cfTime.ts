export function parseCFDatum(s: string): Date | null {
  s = s.trim()
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d)/, '$1T$2')   // "date time" → "dateTtime"
    .replace(/\s+([+-])(\d{2})(\d{2})$/, '$1$2:$3')      // "+0000" → "+00:00"
  if (!/[Zz]$/.test(s) && !/[+-]\d{2}:\d{2}$/.test(s))
    s += s.includes('T') ? 'Z' : 'T00:00:00Z'
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function parseCFTimeUnits(units: string): { multiplierMs: number; epoch: Date } | null {
  const m = units.trim().match(
    /^(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\s+since\s+(.+)$/i,
  )
  if (!m) return null
  const msPerUnit: Record<string, number> = {
    second: 1e3,   seconds: 1e3,  sec: 1e3,   secs: 1e3,
    minute: 60e3,  minutes: 60e3, min: 60e3,  mins: 60e3,
    hour: 3600e3,  hours: 3600e3, hr: 3600e3, hrs: 3600e3,
    day: 86400e3,  days: 86400e3,
    week: 604800e3, weeks: 604800e3,
  }
  const multiplierMs = msPerUnit[m[1].toLowerCase()]
  if (!multiplierMs) return null
  const epoch = parseCFDatum(m[2].trim())
  return epoch ? { multiplierMs, epoch } : null
}

export function formatCFDate(epoch: Date, multiplierMs: number, value: number): string {
  const d = new Date(epoch.getTime() + value * multiplierMs)
  const iso = d.toISOString()
  const [date, timePart] = iso.split('T')
  const time = timePart.replace(/\.000Z$/, '').replace(/Z$/, '')
  return time === '00:00:00' ? date : `${date} ${time}`
}
