interface Props {
  kind: 'sun' | 'earth'
  x: number
  y: number
  size?: number
  faded?: boolean
}

export function BodyGlyph({ kind, x, y, size = 8, faded = false }: Props) {
  if (kind === 'sun') {
    return (
      <g opacity={faded ? 0.6 : 1}>
        <circle cx={x} cy={y} r={size} fill="var(--sun)" stroke="var(--sun-2)" strokeWidth={2} />
        <circle cx={x} cy={y} r={size + 4} fill="none" stroke="var(--sun)" strokeWidth={1} opacity={0.7} />
      </g>
    )
  }
  const d = size + 1
  return (
    <g opacity={faded ? 0.6 : 1}>
      <path
        d={`M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z`}
        fill="var(--earth)"
        stroke="var(--label)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </g>
  )
}
