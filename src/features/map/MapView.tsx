import { Layers, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, WMSTileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from 'leaflet'
import { useAuth } from '../auth/AuthContext'
import { useRoomSocket } from '../realtime/RoomSocketContext'
import { useNombreUsuario } from '../users/useNombreUsuario'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { crearIconoMarcador, ETIQUETA_TIPO } from './markerIcon'
import { MarkerFormModal, type MarkerDraft } from './MarkerFormModal'
import { CursorLayer } from './CursorLayer'
import { AlertToastStack } from '../alerts/AlertToastStack'
import type { Marcador, TipoMarcador } from '../../types/realtime'

const CENTRO_DEFECTO: [number, number] = [15, -35]
const ZOOM_DEFECTO = 3

type CapaBase = 'calles' | 'batimetria'

// GEBCO (General Bathymetric Chart of the Oceans): estándar internacional de batimetría,
// WMS público sin API key. Endpoint vigente desde sep-2024 (el anterior /gebco_web_services/
// .../mapserv fue dado de baja). GEBCO_LATEST_2 = grid coloreado por elevación/profundidad,
// más legible que GEBCO_LATEST (solo relieve sombreado en escala de grises).
const GEBCO_WMS_URL = 'https://wms.gebco.net/mapserv?'
const GEBCO_LAYER = 'GEBCO_LATEST_2'

function ToggleCapaBase({ capa, onChange }: { capa: CapaBase; onChange: (capa: CapaBase) => void }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-[1000] flex overflow-hidden rounded-control border border-border-strong bg-surface shadow-lg">
      <button
        type="button"
        onClick={() => onChange('calles')}
        aria-pressed={capa === 'calles'}
        title="Mapa de calles"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors
          ${capa === 'calles' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text'}`}
      >
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Mapa
      </button>
      <button
        type="button"
        onClick={() => onChange('batimetria')}
        aria-pressed={capa === 'batimetria'}
        title="Batimetría (GEBCO)"
        className={`flex items-center gap-1.5 border-l border-border-strong px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors
          ${capa === 'batimetria' ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text'}`}
      >
        <Waves className="h-3.5 w-3.5" aria-hidden="true" />
        Batimetría
      </button>
    </div>
  )
}

function ManejadorClicks({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    },
  })
  return null
}

function RastreadorCursor() {
  const map = useMap()
  const { moverCursor } = useRoomSocket()

  useEffect(() => {
    const contenedor = map.getContainer()

    // DIAG-CURSOR (temporal, quitar tras el diagnóstico): frecuencia REAL con la que el
    // navegador dispara el evento nativo mousemove, antes de nuestro throttle. Si el navegador ya
    // los agrupa/limita internamente (tab en background, carga de CPU, etc.), se vería aquí.
    let diagUltimo = 0
    let diagN = 0
    let diagSuma = 0
    let diagMin = Infinity
    let diagMax = 0
    let diagResumen = performance.now()

    function onMouseMove(e: MouseEvent) {
      const ahoraDiag = performance.now()
      if (diagUltimo) {
        const dt = ahoraDiag - diagUltimo
        diagN++
        diagSuma += dt
        diagMin = Math.min(diagMin, dt)
        diagMax = Math.max(diagMax, dt)
      }
      diagUltimo = ahoraDiag
      if (ahoraDiag - diagResumen > 2000 && diagN > 0) {
        console.log(
          `[DIAG-CURSOR emisor:mousemove nativo] n=${diagN} avg=${(diagSuma / diagN).toFixed(1)}ms min=${diagMin.toFixed(1)}ms max=${diagMax.toFixed(1)}ms`,
        )
        diagN = 0
        diagSuma = 0
        diagMin = Infinity
        diagMax = 0
        diagResumen = ahoraDiag
      }

      const rect = contenedor.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      if (x < 0 || x > 100 || y < 0 || y > 100) return
      moverCursor(x, y)
    }
    contenedor.addEventListener('mousemove', onMouseMove)
    return () => contenedor.removeEventListener('mousemove', onMouseMove)
  }, [map, moverCursor])

  return null
}

function PopupMarcador({
  marcador,
  onEditar,
  onEliminar,
}: {
  marcador: Marcador
  onEditar: () => void
  onEliminar: () => void
}) {
  const nombreAutor = useNombreUsuario(marcador.usuarioId)
  const { auth } = useAuth()
  const { soyLider } = useRoomSocket()
  const puedeEliminar = auth?.usuarioId === marcador.creadorId || soyLider

  return (
    <div className="min-w-40 text-sm">
      <p className="font-semibold text-text">{ETIQUETA_TIPO[marcador.tipo]}</p>
      {marcador.descripcion && <p className="mt-1 text-text-secondary">{marcador.descripcion}</p>}
      <p className="mt-2 text-xs text-text-muted">
        {nombreAutor} · {new Date(marcador.fechaUltimaEdicion).toLocaleString()}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onEditar}
          className="text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          Editar
        </button>
        {puedeEliminar && (
          <button
            type="button"
            onClick={onEliminar}
            className="text-xs font-medium text-danger hover:underline cursor-pointer"
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}

export function MapView() {
  const { marcadores, enviarMarcador, eliminarMarcador } = useRoomSocket()
  const [draft, setDraft] = useState<MarkerDraft | null>(null)
  const [capaBase, setCapaBase] = useState<CapaBase>('calles')
  const [marcadorAEliminar, setMarcadorAEliminar] = useState<Marcador | null>(null)

  function handleConfirm(tipo: TipoMarcador, descripcion: string) {
    if (!draft) return
    enviarMarcador({
      id: draft.marcador?.id,
      latitud: draft.marcador ? draft.marcador.latitud : draft.latlng.lat,
      longitud: draft.marcador ? draft.marcador.longitud : draft.latlng.lng,
      tipo,
      descripcion,
    })
    setDraft(null)
  }

  return (
    <div className="relative isolate z-0 h-full w-full">
      <MapContainer center={CENTRO_DEFECTO} zoom={ZOOM_DEFECTO} className="h-full w-full" worldCopyJump>
        {capaBase === 'calles' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        ) : (
          <WMSTileLayer
            url={GEBCO_WMS_URL}
            layers={GEBCO_LAYER}
            format="image/png"
            transparent={false}
            version="1.3.0"
            attribution='Bathymetric imagery &copy; <a href="https://www.gebco.net/">GEBCO</a>, <a href="https://seabed2030.org/">Nippon Foundation-GEBCO Seabed 2030 Project</a>'
          />
        )}
        <ManejadorClicks onMapClick={(latlng) => setDraft({ latlng })} />
        <RastreadorCursor />

        {marcadores.map((marcador) => (
          <Marker
            key={marcador.id}
            position={[marcador.latitud, marcador.longitud]}
            icon={crearIconoMarcador(marcador.tipo)}
          >
            <Popup>
              <PopupMarcador
                marcador={marcador}
                onEditar={() =>
                  setDraft({ latlng: { lat: marcador.latitud, lng: marcador.longitud }, marcador })
                }
                onEliminar={() => setMarcadorAEliminar(marcador)}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <CursorLayer />
      <AlertToastStack />
      <ToggleCapaBase capa={capaBase} onChange={setCapaBase} />

      <MarkerFormModal draft={draft} onClose={() => setDraft(null)} onConfirm={handleConfirm} />

      <ConfirmModal
        open={marcadorAEliminar !== null}
        title="Eliminar marcador"
        message={`¿Seguro que quieres eliminar este marcador${marcadorAEliminar?.descripcion ? ` («${marcadorAEliminar.descripcion}»)` : ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={async () => {
          if (marcadorAEliminar) await eliminarMarcador(marcadorAEliminar.id)
        }}
        onClose={() => setMarcadorAEliminar(null)}
      />
    </div>
  )
}
