export type Theme = 'dark' | 'light'

const THEME_KEY = 'touchdown.theme'
const LANG_KEY = 'touchdown.lang'

export function readPref(key: 'theme' | 'lang'): string | null {
  try {
    return window.localStorage.getItem(key === 'theme' ? THEME_KEY : LANG_KEY)
  } catch {
    return null
  }
}

export function writePref(key: 'theme' | 'lang', value: string): void {
  try {
    window.localStorage.setItem(key === 'theme' ? THEME_KEY : LANG_KEY, value)
  } catch {
    return
  }
}

export function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export const BOOT_SCRIPT = `(function(){var d=document.documentElement;var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}d.setAttribute('data-theme',t==='dark'?'dark':'light');var l=null;try{l=localStorage.getItem('${LANG_KEY}')}catch(e){}if(l!=='es'&&l!=='en'){l=((navigator.language||'').toLowerCase().indexOf('es')===0)?'es':'en'}d.setAttribute('lang',l)})()`
