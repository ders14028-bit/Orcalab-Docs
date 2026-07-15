import { useCallback, useEffect, useRef, useState } from 'react'
import type { ParticipanteVoz, VozSenalMensaje } from '../../types/realtime'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const CLAVE_DISPOSITIVO_GUARDADO = 'orcalab.microfonoId'

/** Mensajes en español para los errores más comunes de getUserMedia, en vez del genérico del navegador. */
function mensajeDeErrorMicrofono(err: unknown): string {
  const nombre = err instanceof DOMException ? err.name : (err as { name?: string } | null)?.name
  switch (nombre) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permiso de micrófono denegado. Habilitalo en la configuración del sitio de tu navegador y volvé a intentar.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ningún micrófono. Conectá uno y volvé a intentar.'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'No se pudo acceder al micrófono: puede estar siendo usado por otra aplicación.'
    case 'OverconstrainedError':
      return 'El micrófono seleccionado ya no está disponible. Elegí otro dispositivo.'
    case 'TRACK_INACTIVO':
      return 'No se detectó audio de tu micrófono. Verificá que el navegador tenga seleccionado el dispositivo correcto en la configuración del sitio y volvé a intentar.'
    default:
      return 'No se pudo acceder al micrófono. Revisá los permisos del navegador.'
  }
}

/**
 * Pide el stream de audio y valida que realmente vaya a transmitir algo: el navegador puede
 * conceder el permiso y devolver un track que nunca llega a 'live' (dispositivo ocupado,
 * mal negociado la primera vez). Reintenta una vez antes de rendirse, porque ese estado a
 * veces se resuelve solo entre el primer y el segundo intento.
 */
async function obtenerStreamValidado(dispositivoId?: string | null): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: dispositivoId ? { deviceId: { exact: dispositivoId } } : true,
  }

  const intentar = async () => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    const track = stream.getAudioTracks()[0]
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((t) => t.stop())
      throw Object.assign(new Error('Track de audio inactivo'), { name: 'TRACK_INACTIVO' })
    }
    return stream
  }

  try {
    return await intentar()
  } catch (err) {
    if ((err as { name?: string }).name !== 'TRACK_INACTIVO') throw err
    return await intentar()
  }
}

interface UseVoiceCallDeps {
  usuarioId: number | undefined
  participantesVozPorCanal: Record<string, ParticipanteVoz[]>
  entrarVoz: (canalId: string) => void
  salirVoz: (canalId: string) => void
  silenciarVoz: (canalId: string, muteado: boolean) => void
  enviarOfertaVoz: (canalId: string, paraUsuarioId: number, sdp: string) => void
  enviarRespuestaVoz: (canalId: string, paraUsuarioId: number, sdp: string) => void
  enviarIceVoz: (canalId: string, paraUsuarioId: number, candidato: RTCIceCandidateInit) => void
  suscribirSenalVoz: (handler: (mensaje: VozSenalMensaje) => void) => () => void
}

/**
 * Estado de la llamada de voz, independiente de qué canal se esté VIENDO (canalActivoId
 * en RoomSocketContext): se llama una sola vez desde RoomSocketProvider (vida = sala),
 * no desde el panel del canal (vida = canal que se está mirando), para que navegar entre
 * canales de texto no cuelgue la llamada. Ver "canalVozActivoId" en el valor retornado.
 */
export function useVoiceCall({
  usuarioId,
  participantesVozPorCanal,
  entrarVoz,
  salirVoz,
  silenciarVoz,
  enviarOfertaVoz,
  enviarRespuestaVoz,
  enviarIceVoz,
  suscribirSenalVoz,
}: UseVoiceCallDeps) {
  const [canalVozActivoId, setCanalVozActivoId] = useState<string | null>(null)
  const [muteado, setMuteado] = useState(false)
  const [streamsRemotos, setStreamsRemotos] = useState<Record<number, MediaStream>>({})
  const [error, setError] = useState<string | null>(null)
  const [avisoMicrofono, setAvisoMicrofono] = useState<string | null>(null)
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([])
  const [dispositivoId, setDispositivoId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_DISPOSITIVO_GUARDADO)
    } catch {
      return null
    }
  })

  // Ref espejo del estado, para leer el canal activo desde callbacks que no deben
  // recrearse en cada cambio (unirse/alternarMute) sin caer en closures obsoletas.
  const canalVozActivoIdRef = useRef<string | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Record<number, RTCPeerConnection>>({})
  const candidatosPendientesRef = useRef<Record<number, RTCIceCandidateInit[]>>({})
  const participantesPreviosRef = useRef<Set<number>>(new Set())

  const cerrarConexion = useCallback((remotoId: number) => {
    peersRef.current[remotoId]?.close()
    delete peersRef.current[remotoId]
    delete candidatosPendientesRef.current[remotoId]
    setStreamsRemotos((prev) => {
      if (!(remotoId in prev)) return prev
      const { [remotoId]: _eliminado, ...resto } = prev
      return resto
    })
  }, [])

  const obtenerOCrearConexion = useCallback(
    (remotoId: number, canalId: string) => {
      const existente = peersRef.current[remotoId]
      if (existente) return existente

      const pc = new RTCPeerConnection(ICE_SERVERS)
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })

      pc.ontrack = (event) => {
        setStreamsRemotos((prev) => ({ ...prev, [remotoId]: event.streams[0] }))
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          enviarIceVoz(canalId, remotoId, event.candidate.toJSON())
        }
      }

      peersRef.current[remotoId] = pc
      return pc
    },
    [enviarIceVoz],
  )

  const aplicarCandidatosPendientes = useCallback(async (remotoId: number, pc: RTCPeerConnection) => {
    const pendientes = candidatosPendientesRef.current[remotoId] ?? []
    delete candidatosPendientesRef.current[remotoId]
    for (const candidato of pendientes) {
      await pc.addIceCandidate(candidato)
    }
  }, [])

  const iniciarOferta = useCallback(
    async (remotoId: number, canalId: string) => {
      const pc = obtenerOCrearConexion(remotoId, canalId)
      const oferta = await pc.createOffer()
      await pc.setLocalDescription(oferta)
      enviarOfertaVoz(canalId, remotoId, oferta.sdp ?? '')
    },
    [enviarOfertaVoz, obtenerOCrearConexion],
  )

  const manejarOferta = useCallback(
    async (remotoId: number, sdp: string, canalId: string) => {
      const pc = obtenerOCrearConexion(remotoId, canalId)
      await pc.setRemoteDescription({ type: 'offer', sdp })
      await aplicarCandidatosPendientes(remotoId, pc)
      const respuesta = await pc.createAnswer()
      await pc.setLocalDescription(respuesta)
      enviarRespuestaVoz(canalId, remotoId, respuesta.sdp ?? '')
    },
    [aplicarCandidatosPendientes, enviarRespuestaVoz, obtenerOCrearConexion],
  )

  const manejarRespuesta = useCallback(
    async (remotoId: number, sdp: string) => {
      const pc = peersRef.current[remotoId]
      if (!pc) return
      await pc.setRemoteDescription({ type: 'answer', sdp })
      await aplicarCandidatosPendientes(remotoId, pc)
    },
    [aplicarCandidatosPendientes],
  )

  const manejarIce = useCallback(async (remotoId: number, candidato: RTCIceCandidateInit) => {
    const pc = peersRef.current[remotoId]
    if (pc?.remoteDescription) {
      await pc.addIceCandidate(candidato)
    } else {
      candidatosPendientesRef.current[remotoId] = [...(candidatosPendientesRef.current[remotoId] ?? []), candidato]
    }
  }, [])

  // Señalización entrante: filtra por el canal de voz al que estamos conectados en este
  // momento (la cola privada del usuario es genérica para toda la sala, no por canal).
  useEffect(() => {
    if (!canalVozActivoId) return
    return suscribirSenalVoz((mensaje) => {
      if (mensaje.canalId !== canalVozActivoId) return
      const remotoId = mensaje.deUsuarioId

      if (mensaje.tipo === 'OFERTA' && mensaje.sdp) manejarOferta(remotoId, mensaje.sdp, canalVozActivoId)
      else if (mensaje.tipo === 'RESPUESTA' && mensaje.sdp) manejarRespuesta(remotoId, mensaje.sdp)
      else if (mensaje.tipo === 'ICE' && mensaje.candidato) manejarIce(remotoId, mensaje.candidato)
    })
  }, [canalVozActivoId, suscribirSenalVoz, manejarOferta, manejarRespuesta, manejarIce])

  // Regla anti-glare: para cualquier par, quien tiene el usuarioId menor siempre ofrece hacia el
  // mayor; el otro lado solo espera y responde. Se evalúa cada vez que cambia la lista de
  // participantes del canal de voz activo, cubriendo tanto "yo entro con gente ya hablando" como
  // "alguien entra mientras yo ya estoy".
  useEffect(() => {
    if (!canalVozActivoId || usuarioId === undefined) return

    const lista = participantesVozPorCanal[canalVozActivoId] ?? []
    const idsActuales = new Set(lista.map((p) => p.usuarioId).filter((id) => id !== usuarioId))
    const previos = participantesPreviosRef.current

    idsActuales.forEach((id) => {
      if (!previos.has(id) && usuarioId < id) {
        iniciarOferta(id, canalVozActivoId)
      }
    })
    previos.forEach((id) => {
      if (!idsActuales.has(id)) cerrarConexion(id)
    })

    participantesPreviosRef.current = idsActuales
  }, [participantesVozPorCanal, canalVozActivoId, usuarioId, iniciarOferta, cerrarConexion])

  const colgar = useCallback(() => {
    const canalId = canalVozActivoIdRef.current
    Object.keys(peersRef.current).forEach((id) => cerrarConexion(Number(id)))
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    participantesPreviosRef.current = new Set()
    if (canalId) salirVoz(canalId)
    canalVozActivoIdRef.current = null
    setCanalVozActivoId(null)
    setMuteado(false)
    setStreamsRemotos({})
    setAvisoMicrofono(null)
  }, [salirVoz, cerrarConexion])

  const colgarRef = useRef(colgar)
  colgarRef.current = colgar

  // Cablea el track de audio local a los eventos que indican que dejó de transmitir en
  // silencio: 'ended' (dispositivo desconectado/revocado) corta la llamada, porque seguir
  // conectado sin audio confunde más que salir; 'mute'/'unmute' (el SO silencia el hardware,
  // ej. otra app tomó el micrófono) solo avisa, porque suele resolverse solo.
  const observarTrackLocal = useCallback((track: MediaStreamTrack) => {
    track.onended = () => {
      setError('Se perdió la conexión con tu micrófono (¿se desconectó el dispositivo?). Volvé a unirte a la llamada.')
      colgarRef.current()
    }
    track.onmute = () => {
      setAvisoMicrofono('Tu micrófono dejó de recibir audio (puede estar en uso por otra aplicación o silenciado por el sistema).')
    }
    track.onunmute = () => {
      setAvisoMicrofono(null)
    }
  }, [])

  const actualizarDispositivos = useCallback(async () => {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices()
      setDispositivos(lista.filter((d) => d.kind === 'audioinput'))
    } catch {
      // Sin permiso todavía o API no disponible: se reintenta en el próximo devicechange/unirse.
    }
  }, [])

  useEffect(() => {
    actualizarDispositivos()
    navigator.mediaDevices?.addEventListener?.('devicechange', actualizarDispositivos)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', actualizarDispositivos)
  }, [actualizarDispositivos])

  const seleccionarDispositivo = useCallback(
    async (id: string) => {
      setDispositivoId(id)
      try {
        localStorage.setItem(CLAVE_DISPOSITIVO_GUARDADO, id)
      } catch {
        // Almacenamiento no disponible (modo privado, cuota llena): la preferencia solo dura la sesión.
      }

      // Si no hay llamada activa, el nuevo dispositivo se usará recién en el próximo "unirse".
      if (!canalVozActivoIdRef.current || !localStreamRef.current) return

      setError(null)
      try {
        const nuevoStream = await obtenerStreamValidado(id)
        const nuevoTrack = nuevoStream.getAudioTracks()[0]
        nuevoTrack.enabled = !muteado
        observarTrackLocal(nuevoTrack)

        Object.values(peersRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio')
          sender?.replaceTrack(nuevoTrack)
        })

        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = nuevoStream
        setAvisoMicrofono(null)
      } catch (err) {
        setError(mensajeDeErrorMicrofono(err))
      }
    },
    [muteado, observarTrackLocal],
  )

  const unirse = useCallback(
    async (canalId: string) => {
      if (canalVozActivoIdRef.current === canalId) return

      setError(null)
      // Estilo Discord: cambiar de canal de voz mientras ya se está en uno es instantáneo,
      // no requiere colgar manualmente antes — cuelga el anterior y entra al nuevo.
      if (canalVozActivoIdRef.current) {
        colgar()
      }

      try {
        const stream = await obtenerStreamValidado(dispositivoId)
        observarTrackLocal(stream.getAudioTracks()[0])
        localStreamRef.current = stream
        canalVozActivoIdRef.current = canalId
        setCanalVozActivoId(canalId)
        entrarVoz(canalId)
        // Recién con permiso concedido el navegador expone las etiquetas reales de los
        // dispositivos (antes enumerateDevices() los devuelve con label vacío).
        actualizarDispositivos()
      } catch (err) {
        setError(mensajeDeErrorMicrofono(err))
      }
    },
    [entrarVoz, colgar, dispositivoId, observarTrackLocal, actualizarDispositivos],
  )

  const alternarMute = useCallback(() => {
    const canalId = canalVozActivoIdRef.current
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track || !canalId) return
    const nuevoMuteado = !muteado
    track.enabled = !nuevoMuteado
    setMuteado(nuevoMuteado)
    silenciarVoz(canalId, nuevoMuteado)
  }, [muteado, silenciarVoz])

  // Colgar solo al desmontar (= salir de la sala, ver RoomShellLayout: RoomSocketProvider
  // está keyed por salaId), nunca al cambiar de canal que se está viendo. Reutiliza el
  // colgarRef declarado arriba (también usado por observarTrackLocal).
  useEffect(() => {
    return () => {
      if (canalVozActivoIdRef.current) colgarRef.current()
    }
  }, [])

  return {
    canalVozActivoId,
    muteado,
    streamsRemotos,
    error,
    avisoMicrofono,
    dispositivos,
    dispositivoId,
    seleccionarDispositivo,
    unirse,
    salir: colgar,
    alternarMute,
  }
}
