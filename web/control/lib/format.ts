export function formatNumber(locale: string, n: number, digits = 1): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(n)
    .replace('-', '−')
}
