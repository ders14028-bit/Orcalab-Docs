import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import type { Marcador, TipoMarcador } from '../../types/realtime'
import { ETIQUETA_TIPO } from './markerIcon'
import { clasificarImagen, ETIQUETA_ESPECIE, VisionServiceError, type ClasificacionVision } from './visionService'

export interface MarkerDraft {
  latlng: { lat: number; lng: number }
  marcador?: Marcador
}

const TIPOS: TipoMarcador[] = ['AVISTAMIENTO', 'ZONA_INTERES', 'CRITICO']

function tonoConfianza(confianza: number): 'success' | 'warning' | 'neutral' {
  if (confianza >= 0.8) return 'success'
  if (confianza >= 0.5) return 'warning'
  return 'neutral'
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Analizando imagen"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-primary"
    />
  )
}

export function MarkerFormModal({
  draft,
  onClose,
  onConfirm,
}: {
  draft: MarkerDraft | null
  onClose: () => void
  onConfirm: (tipo: TipoMarcador, descripcion: string) => void
}) {
  const [tipo, setTipo] = useState<TipoMarcador>('AVISTAMIENTO')
  const [descripcion, setDescripcion] = useState('')

  const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string | null>(null)
  const [clasificando, setClasificando] = useState(false)
  const [clasificacion, setClasificacion] = useState<ClasificacionVision | null>(null)
  const [errorClasificacion, setErrorClasificacion] = useState<string | null>(null)
  const [sugerenciaAceptada, setSugerenciaAceptada] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function limpiarFoto() {
    abortRef.current?.abort()
    setFotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setClasificando(false)
    setClasificacion(null)
    setErrorClasificacion(null)
    setSugerenciaAceptada(false)
  }

  useEffect(() => {
    if (draft?.marcador) {
      setTipo(draft.marcador.tipo)
      setDescripcion(draft.marcador.descripcion ?? '')
    } else {
      setTipo('AVISTAMIENTO')
      setDescripcion('')
    }
    limpiarFoto()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // Revoca el object URL del preview al desmontar, para no filtrar memoria.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      setFotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return prev
      })
    }
  }, [])

  async function handleFotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // permite re-seleccionar el mismo archivo despues
    if (!file) return

    limpiarFoto()
    setFotoPreviewUrl(URL.createObjectURL(file))
    setClasificando(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const resultado = await clasificarImagen(file, controller.signal)
      if (controller.signal.aborted) return
      setClasificacion(resultado)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof VisionServiceError || err instanceof TypeError) {
        setErrorClasificacion('No se pudo analizar la imagen automáticamente, puedes seleccionar la especie manualmente')
      } else {
        throw err
      }
    } finally {
      if (!controller.signal.aborted) setClasificando(false)
    }
  }

  function aceptarSugerencia() {
    if (!clasificacion) return
    const pct = Math.round(clasificacion.confianza * 100)
    const linea = `Especie sugerida: ${ETIQUETA_ESPECIE[clasificacion.especie]} (${pct}% confianza)`
    setDescripcion((prev) => (prev.trim() ? `${linea}\n${prev}` : linea))
    setSugerenciaAceptada(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onConfirm(tipo, descripcion)
  }

  const esEdicion = Boolean(draft?.marcador)

  return (
    <Modal open={draft !== null} title={esEdicion ? 'Editar marcador' : 'Nuevo marcador'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-text-secondary">Tipo</legend>
          {TIPOS.map((opcion) => (
            <label
              key={opcion}
              className={`flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-sm
                ${tipo === opcion ? 'border-primary bg-primary-soft text-text' : 'border-border-strong text-text-secondary'}`}
            >
              <input
                type="radio"
                name="tipoMarcador"
                value={opcion}
                checked={tipo === opcion}
                onChange={() => setTipo(opcion)}
                className="accent-primary"
              />
              {ETIQUETA_TIPO[opcion]}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="descripcion-marcador" className="text-sm font-medium text-text-secondary">
            Descripción
          </label>
          <textarea
            id="descripcion-marcador"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text
              placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="¿Qué se observó?"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="foto-marcador" className="text-sm font-medium text-text-secondary">
            Foto (opcional) — identifica la especie automáticamente
          </label>
          <input
            id="foto-marcador"
            type="file"
            accept="image/*"
            onChange={handleFotoChange}
            className="text-sm text-text-secondary file:mr-3 file:rounded-control file:border-0
              file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text
              file:cursor-pointer cursor-pointer"
          />

          {fotoPreviewUrl && (
            <div className="flex items-start gap-3 rounded-control border border-border-strong bg-surface p-3">
              <img
                src={fotoPreviewUrl}
                alt="Vista previa de la foto seleccionada"
                className="h-20 w-20 rounded-control object-cover"
              />
              <div className="flex flex-1 flex-col gap-2">
                {clasificando && (
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Spinner />
                    Analizando imagen…
                  </div>
                )}

                {clasificacion && (
                  <div className="flex flex-col gap-2">
                    <Badge tone={tonoConfianza(clasificacion.confianza)}>
                      {ETIQUETA_ESPECIE[clasificacion.especie]} — {Math.round(clasificacion.confianza * 100)}% confianza
                    </Badge>
                    {!sugerenciaAceptada ? (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={aceptarSugerencia}
                          className="cursor-pointer rounded-control bg-primary-soft px-2.5 py-1 text-xs font-medium text-text hover:opacity-90"
                        >
                          Usar esta sugerencia
                        </button>
                        <button
                          type="button"
                          onClick={() => setClasificacion(null)}
                          className="cursor-pointer text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary"
                        >
                          Ignorar
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted">Agregada a la descripción — podés editarla libremente.</p>
                    )}
                  </div>
                )}

                {errorClasificacion && <p className="text-xs text-text-muted">{errorClasificacion}</p>}

                <button
                  type="button"
                  onClick={limpiarFoto}
                  className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary"
                >
                  Quitar foto
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">{esEdicion ? 'Guardar cambios' : 'Agregar marcador'}</Button>
        </div>
      </form>
    </Modal>
  )
}
