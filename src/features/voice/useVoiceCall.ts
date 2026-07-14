import { useCallback, useEffect, useRef, useState } from 'react'
import type { ParticipanteVoz, VozSenalMensaje } from '../../types/realtime'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
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
  }, [salirVoz, cerrarConexion])

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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = stream
        canalVozActivoIdRef.current = canalId
        setCanalVozActivoId(canalId)
        entrarVoz(canalId)
      } catch {
        setError('No se pudo acceder al micrófono. Revisá los permisos del navegador.')
      }
    },
    [entrarVoz, colgar],
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
  // está keyed por salaId), nunca al cambiar de canal que se está viendo.
  const colgarRef = useRef(colgar)
  colgarRef.current = colgar
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
    unirse,
    salir: colgar,
    alternarMute,
  }
}
