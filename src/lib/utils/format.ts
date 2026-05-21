export function formatCurrency(value: number, _currency = "INR"): string {
  if (value >= 10000000) {
    const cr = value / 10000000
    return `₹${cr.toFixed(cr % 1 === 0 ? 0 : 1)}Cr`
  }
  if (value >= 100000) {
    const l = value / 100000
    return `₹${l.toFixed(l % 1 === 0 ? 0 : 1)}L`
  }
  if (value >= 1000) {
    const k = value / 1000
    return `₹${k.toFixed(k % 1 === 0 ? 0 : 1)}K`
  }
  return `₹${value.toLocaleString("en-IN")}`
}

export function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN")}`
}

export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-IN")
}
