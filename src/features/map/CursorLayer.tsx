import { MousePointer2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useRoomSocket } from '../realtime/RoomSocketContext'
import { useNombreUsuario } from '../users/useNombreUsuario'
import { colorParaUsuario } from './cursorColor'

// Tasa de convergencia del suavizado exponencial (1/s): a mayor valor, más rápido "alcanza" el
// cursor interpolado al objetivo. 12 ≈ cierra un 18% de la distancia restante en un frame de
// 60fps (16.7ms) — a propósito NO se usa un % fijo por frame (eso se vería distinto según el
// refresh rate real del monitor/pestaña); con esta fórmula el resultado converge igual sin
// importar la duración real de cada frame, incluyendo los irregulares por jitter de red.
const VELOCIDAD_SEGUIMIENTO = 12
// Umbral para dejar de animar (en % del contenedor) y no gastar CPU con un cursor quieto.
const UMBRAL_DETENER = 0.05
// Tope al dt de un frame: si la pestaña estuvo en background y se reanuda, evita un salto
// gigante tratando ese hueco como si fuera un solo frame lentísimo.
const DT_MAX_S = 0.1

function CursorRemoto({ usuarioId, x, y }: { usuarioId: number; x: number; y: number }) {
  const nombre = useNombreUsuario(usuarioId)
  const color = colorParaUsuario(usuarioId)

  const elRef = useRef<HTMLDivElement>(null)
  // Poblados una sola vez con la posición inicial real (useRef ignora cambios posteriores del
  // argumento): evita que un cursor recién aparecido "vuele" desde 0,0 hasta su posición real.
  const posicionRef = useRef({ x, y })
  const objetivoRef = useRef({ x, y })
  const rafRef = useRef<number | null>(null)
  const ultimoFrameRef = useRef(0)

  // Se lee dentro del loop de abajo en cada frame; asignar esto en el render no es un efecto
  // secundario real (no toca el DOM ni dispara nada), solo deja "dicho" hacia dónde ir.
  objetivoRef.current = { x, y }

  // Estable entre renders (no depende de closures externas, todo vía refs): permite en el efecto
  // de abajo re-arrancar el loop sin recrear esta función cada vez que llega una posición nueva.
  const animar = useCallback((ahora: number) => {
    const el = elRef.current
    const pos = posicionRef.current
    const objetivo = objetivoRef.current
    const dt = ultimoFrameRef.current ? Math.min((ahora - ultimoFrameRef.current) / 1000, DT_MAX_S) : 1 / 60
    ultimoFrameRef.current = ahora

    const dx = objetivo.x - pos.x
    const dy = objetivo.y - pos.y

    if (Math.hypot(dx, dy) < UMBRAL_DETENER) {
      pos.x = objetivo.x
      pos.y = objetivo.y
      if (el) {
        el.style.left = `${pos.x}%`
        el.style.top = `${pos.y}%`
      }
      rafRef.current = null // detiene el loop: no hay más frames pendientes hasta el próximo objetivo
      return
    }

    const t = 1 - Math.exp(-VELOCIDAD_SEGUIMIENTO * dt)
    pos.x += dx * t
    pos.y += dy * t
    if (el) {
      el.style.left = `${pos.x}%`
      el.style.top = `${pos.y}%`
    }

    rafRef.current = requestAnimationFrame(animar)
  }, [])

  // Posición inicial antes del primer paint: el div no lleva left/top reactivo en el JSX (eso
  // pisaría la animación en cada re-render con el x/y crudo, sin pasar por la interpolación).
  useLayoutEffect(() => {
    const el = elRef.current
    if (el) {
      el.style.left = `${posicionRef.current.x}%`
      el.style.top = `${posicionRef.current.y}%`
    }
  }, [])

  // Llega una posición nueva: si el loop ya está corriendo, esta pasada es un no-op (el frame en
  // curso ya lee el objetivo actualizado vía la ref); si estaba detenido (cursor que estaba
  // quieto), lo reinicia.
  useEffect(() => {
    if (rafRef.current === null) {
      ultimoFrameRef.current = 0
      rafRef.current = requestAnimationFrame(animar)
    }
  }, [x, y, animar])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div ref={elRef} className="pointer-events-none absolute flex items-center">
      <MousePointer2 className="h-4 w-4 drop-shadow" style={{ color, fill: color }} aria-hidden="true" />
      <span
        className="orcalab-cursor-label rounded-control px-1.5 py-0.5 text-xs font-medium text-white shadow"
        style={{ backgroundColor: color }}
      >
        {nombre}
      </span>
    </div>
  )
}

export function CursorLayer() {
  const { cursores } = useRoomSocket()

  return (
    <div className="pointer-events-none absolute inset-0 z-[1000] overflow-hidden">
      {Object.entries(cursores).map(([usuarioId, cursor]) => (
        <CursorRemoto key={usuarioId} usuarioId={Number(usuarioId)} x={cursor.x} y={cursor.y} />
      ))}
    </div>
  )
}
