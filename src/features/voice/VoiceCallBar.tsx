import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRoomSocket } from '../realtime/RoomSocketContext'

function AudioRemoto({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = stream
  }, [stream])

  return <audio ref={audioRef} autoPlay />
}

/**
 * Indicador persistente de llamada de voz activa, visible sin importar qué canal se esté
 * viendo (estilo Discord). También aloja los <audio> que reproducen a los demás participantes:
 * si vivieran dentro de VoiceChannelPanel dejarían de sonar al navegar a un canal de texto,
 * aunque la conexión WebRTC siguiera viva.
 */
export function VoiceCallBar() {
  const { canales, seleccionarCanal, voz } = useRoomSocket()

  return (
    <>
      {Object.entries(voz.streamsRemotos).map(([usuarioId, stream]) => (
        <AudioRemoto key={usuarioId} stream={stream} />
      ))}

      {voz.canalVozActivoId &&
        (() => {
          const canal = canales.find((c) => c.id === voz.canalVozActivoId)
          return (
            <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
              <Volume2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <button
                type="button"
                onClick={() => seleccionarCanal(voz.canalVozActivoId!)}
                className="min-w-0 flex-1 truncate text-left text-xs text-text-secondary hover:text-text cursor-pointer"
                title="Ver este canal de voz"
              >
                Conectado a: <span className="font-medium text-text">{canal?.nombre ?? 'canal de voz'}</span>
              </button>
              <button
                type="button"
                onClick={voz.alternarMute}
                title={voz.muteado ? 'Activar micrófono' : 'Silenciar micrófono'}
                aria-label={voz.muteado ? 'Activar micrófono' : 'Silenciar micrófono'}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-text-muted
                  hover:bg-surface-hover hover:text-text cursor-pointer"
              >
                {voz.muteado ? <MicOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={voz.salir}
                title="Salir de la llamada"
                aria-label="Salir de la llamada"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-danger
                  hover:bg-danger-soft cursor-pointer"
              >
                <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )
        })()}
    </>
  )
}
