import { Check, Copy, LogOut, Trash2, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { FormAlert } from '../../components/ui/FormAlert'
import { ApiError } from '../../lib/http'
import { ChannelList } from '../channels/ChannelList'
import { DeleteRoomModal } from './DeleteRoomModal'
import { VoiceCallBar } from '../voice/VoiceCallBar'
import { useRoomSocket } from '../realtime/RoomSocketContext'
import { useRooms } from './RoomsContext'
import * as roomsApi from './api'
import type { Sala } from '../../types/room'

function CopiarIdSala({ id }: { id: number }) {
  const [copiado, setCopiado] = useState(false)

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(String(id))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Si el portapapeles no está disponible, no hacemos nada más.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopiar}
      title="Copiar ID de la sala"
      className="mt-1 flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer"
    >
      <span>ID: {id}</span>
      {copiado ? (
        <Check className="h-3 w-3 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      <span className="sr-only">{copiado ? 'Copiado' : 'Copiar'}</span>
    </button>
  )
}

// Solo se monta cuando salaActiva existe, lo que implica que RoomSocketProvider ya
// envuelve este árbol (ver RoomShellLayout) — igual que ChannelList. useRoomSocket() nunca
// debe llamarse directo desde RoomPanel, porque también se renderiza fuera del Provider
// cuando no hay una sala activa (ej. en "/").
function EliminarServidorBoton({ sala }: { sala: Sala }) {
  const { soyLider } = useRoomSocket()
  const [abierto, setAbierto] = useState(false)

  if (!soyLider) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Eliminar servidor"
        className="flex items-center gap-1 text-xs text-danger hover:underline cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Eliminar servidor
      </button>
      <DeleteRoomModal open={abierto} onClose={() => setAbierto(false)} sala={sala} />
    </>
  )
}

export function RoomPanel() {
  const { salaId } = useParams()
  const { salas, refetch } = useRooms()
  const navigate = useNavigate()

  const [idParaUnirse, setIdParaUnirse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const salaActiva = salaId ? salas.find((s) => s.id === Number(salaId)) : undefined

  async function handleUnirse(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const id = Number(idParaUnirse)
    if (!Number.isInteger(id) || id <= 0) {
      setError('Ingresa un ID de sala válido')
      return
    }

    setLoading(true)
    try {
      await roomsApi.unirseASala(id)
      await refetch()
      setIdParaUnirse('')
      navigate(`/salas/${id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo unir a la sala')
    } finally {
      setLoading(false)
    }
  }

  async function handleSalir() {
    if (!salaActiva) return
    try {
      await roomsApi.salirDeSala(salaActiva.id)
      await refetch()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo salir de la sala')
    }
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg-sidebar">
      <div className="border-b border-border p-4">
        {salaActiva ? (
          <>
            <h1 className="truncate font-heading text-base font-semibold text-text">
              {salaActiva.nombre}
            </h1>
            <CopiarIdSala id={salaActiva.id} />
            {salaActiva.descripcion && (
              <p className="mt-1 line-clamp-2 text-xs text-text-muted">{salaActiva.descripcion}</p>
            )}
            <div className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {salaActiva.totalMiembros} miembro{salaActiva.totalMiembros === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={handleSalir}
                title="Salir de la sala"
                className="flex items-center gap-1 text-xs text-danger hover:underline cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Salir
              </button>
            </div>
            <div className="mt-1">
              <EliminarServidorBoton sala={salaActiva} />
            </div>
          </>
        ) : (
          <div>
            <h1 className="font-heading text-base font-semibold text-text">OrcaLab</h1>
            <p className="mt-1 text-xs text-text-muted">Selecciona o crea una sala para comenzar</p>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {salaActiva && <ChannelList />}

        <div className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Unirse por ID
          </p>
          <form onSubmit={handleUnirse} className="flex flex-col gap-2" noValidate>
            {error && <FormAlert message={error} />}
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={idParaUnirse}
                onChange={(e) => setIdParaUnirse(e.target.value)}
                placeholder="ID de sala"
                aria-label="ID de sala"
                className="h-10 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-sm text-text
                  placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button type="submit" loading={loading} className="h-10 px-3 text-sm">
                Unirse
              </Button>
            </div>
          </form>
        </div>
      </div>

      {salaActiva && <VoiceCallBar />}
    </aside>
  )
}
