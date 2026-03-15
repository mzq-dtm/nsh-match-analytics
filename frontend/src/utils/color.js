export function getContrastColor(hex) {
  if (!hex) return '#000'
  const c = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#000' : '#fff'
}
