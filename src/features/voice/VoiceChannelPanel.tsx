import { Mic, MicOff, PhoneCall, PhoneOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useRoomSocket } from '../realtime/RoomSocketContext'
import { useNombreUsuario } from '../users/useNombreUsuario'
import type { Canal } from '../../types/room'

function FilaParticipante({
  usuarioId,
  muteado,
  esUnoMismo,
}: {
  usuarioId: number
  muteado: boolean
  esUnoMismo: boolean
}) {
  const nombre = useNombreUsuario(usuarioId)
  const Icono = muteado ? MicOff : Mic

  return (
    <li className="flex items-center gap-2 rounded-control px-2 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-text-secondary">
        {nombre.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
        {nombre}
        {esUnoMismo && <span className="text-text-muted"> (tú)</span>}
      </span>
      <Icono className={`h-3.5 w-3.5 shrink-0 ${muteado ? 'text-text-muted' : 'text-success'}`} aria-hidden="true" />
    </li>
  )
}

export function VoiceChannelPanel({ canal }: { canal: Canal }) {
  const { auth } = useAuth()
  const { participantesVozPorCanal, voz } = useRoomSocket()

  const participantes = participantesVozPorCanal[canal.id] ?? []
  const conectadoAEsteCanal = voz.canalVozActivoId === canal.id
  const conectadoAOtroCanal = voz.canalVozActivoId !== null && !conectadoAEsteCanal

  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-4 px-3 py-6">
      <div className="text-center">
        <p className="text-sm font-medium text-text">{canal.nombre}</p>
        <p className="text-xs text-text-muted">
          {participantes.length === 0 ? 'Nadie en la llamada todavía' : `${participantes.length} en la llamada`}
        </p>
      </div>

      {participantes.length > 0 && (
        <ul className="flex w-full max-w-xs flex-col gap-0.5">
          {participantes.map((p) => (
            <FilaParticipante
              key={p.usuarioId}
              usuarioId={p.usuarioId}
              muteado={p.muteado}
              esUnoMismo={p.usuarioId === auth?.usuarioId}
            />
          ))}
        </ul>
      )}

      {voz.error && <p className="text-xs text-danger">{voz.error}</p>}

      {!conectadoAEsteCanal ? (
        <button
          type="button"
          onClick={() => voz.unirse(canal.id)}
          className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white
            hover:bg-primary-hover cursor-pointer"
        >
          <PhoneCall className="h-4 w-4" aria-hidden="true" />
          {conectadoAOtroCanal ? 'Cambiar a esta llamada' : 'Unirse a la llamada'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={voz.alternarMute}
            title={voz.muteado ? 'Activar micrófono' : 'Silenciar micrófono'}
            aria-label={voz.muteado ? 'Activar micrófono' : 'Silenciar micrófono'}
            className="flex h-10 w-10 items-center justify-center rounded-control bg-surface text-text
              hover:bg-surface-hover cursor-pointer"
          >
            {voz.muteado ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={voz.salir}
            title="Salir de la llamada"
            aria-label="Salir de la llamada"
            className="flex h-10 w-10 items-center justify-center rounded-control bg-danger text-white
              hover:opacity-90 cursor-pointer"
          >
            <PhoneOff className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
