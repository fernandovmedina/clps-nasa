import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'out/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  { files: ['components/LunarExperience.tsx'], rules: { 'react-hooks/set-state-in-effect': 'off' } },
]

export default config
