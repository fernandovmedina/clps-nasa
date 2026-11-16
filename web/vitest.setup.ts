import { beforeEach } from 'vitest'
import { setLang } from '@/lib/i18n'

// jsdom reports navigator.language «en-US», but the suite's assertions are in Spanish: every test starts in es.
// persist:false keeps touchdown.lang out of localStorage so tests that read the saved preference see none.
beforeEach(() => {
  setLang('es', { persist: false })
})
