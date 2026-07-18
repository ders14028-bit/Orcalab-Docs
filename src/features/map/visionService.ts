// Cliente para vision-service (clasificador de cetáceos). No reutiliza
// apiFetch de lib/http.ts a propósito: ese wrapper fija Content-Type
// application/json y agrega Authorization, ninguno de los dos aplica a un
// upload multipart hacia un servicio distinto del backend Java.
//
// Default 'http://localhost:8085' para dev local (vision-service no tiene
// proxy propio en vite.config.ts). En producción, VITE_VISION_SERVICE_URL se
// fija a '/api/vision' (ruta relativa vía Kong/Nginx, mismo origen que el
// resto del backend) el día que el servicio se despliegue ahí.
const VISION_SERVICE_URL = import.meta.env.VITE_VISION_SERVICE_URL ?? 'http://localhost:8085'

export type Especie = 'orca' | 'falsa_orca' | 'delfin_nariz_botella' | 'ballena_jorobada' | 'otro_cetaceo'

export interface ClasificacionVision {
  especie: Especie
  confianza: number
  todas_las_probabilidades: Record<string, number>
}

export const ETIQUETA_ESPECIE: Record<Especie, string> = {
  orca: 'Orca',
  falsa_orca: 'Falsa orca',
  delfin_nariz_botella: 'Delfín nariz de botella',
  ballena_jorobada: 'Ballena jorobada',
  otro_cetaceo: 'Otro cetáceo',
}

export class VisionServiceError extends Error {}

export async function clasificarImagen(file: File, signal?: AbortSignal): Promise<ClasificacionVision> {
  const formData = new FormData()
  formData.append('file', file)

  let res: Response
  try {
    // Sin header Content-Type manual: el navegador arma el boundary de
    // multipart/form-data solo si se lo dejamos poner a él.
    res = await fetch(`${VISION_SERVICE_URL}/predict`, { method: 'POST', body: formData, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new VisionServiceError('vision-service no responde')
  }

  if (!res.ok) {
    throw new VisionServiceError(`vision-service rechazó la imagen (HTTP ${res.status})`)
  }

  return (await res.json()) as ClasificacionVision
}
