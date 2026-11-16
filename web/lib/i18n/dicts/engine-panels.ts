import { defineDict } from '../dict'

/** Textos del motor dentro del visor: paneles de pausa/parada (run-panel.ts), el botón para salir de VR y el error de WebXR (app.ts). */
export const enginePanelsDict = defineDict({
  es: {
    stopped: 'Misión detenida',
    restart: 'Reiniciar desde el despegue',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
    exitVr: '✕ Salir de VR',
    webxrUnavailable: 'WebXR no disponible en este navegador',
  },
  en: {
    stopped: 'Mission stopped',
    restart: 'Restart from launch',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    exitVr: '✕ Exit VR',
    webxrUnavailable: 'WebXR is not available in this browser',
  },
});
