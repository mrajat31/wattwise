export const currency = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value)

export const monthLabel = (value: string) => new Intl.DateTimeFormat('en-IN', {
  month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}-01T00:00:00Z`))
