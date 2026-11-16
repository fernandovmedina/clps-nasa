const KEYS = { lang: 'touchdown.lang' } as const
const LANG_KEY = KEYS.lang

export function readPref(key: keyof typeof KEYS): string | null {
  try {
    return window.localStorage.getItem(KEYS[key])
  } catch {
    return null
  }
}

export function writePref(key: keyof typeof KEYS, value: string): void {
  try {
    window.localStorage.setItem(KEYS[key], value)
  } catch {
    return
  }
}

export const BOOT_SCRIPT = `(function(){var d=document.documentElement;var l=null;try{l=localStorage.getItem('${LANG_KEY}')}catch(e){}if(l!=='es'&&l!=='en'){l=((navigator.language||'').toLowerCase().indexOf('es')===0)?'es':'en'}d.setAttribute('lang',l)})()`
