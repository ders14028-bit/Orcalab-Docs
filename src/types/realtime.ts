import type { RolSala } from './room'

export type TipoMarcador = 'AVISTAMIENTO' | 'ZONA_INTERES' | 'CRITICO'

export interface Marcador {
  id: string
  salaId: number
  usuarioId: number
  creadorId: number
  latitud: number
  longitud: number
  tipo: TipoMarcador
  descripcion: string | null
  fechaCreacion: string
  fechaUltimaEdicion: string
}

export interface MarcadorRequest {
  id?: string
  latitud: number
  longitud: number
  tipo: TipoMarcador
  descripcion: string
}

export interface Mensaje {
  id: string
  salaId: number
  canalId: string
  usuarioId: number
  contenido: string
  marcadorId: string | null
  timestamp: string
}

export interface MensajeRequest {
  contenido: string
  marcadorId?: string
}

export interface Alerta {
  id: string
  salaId: number
  usuarioId: number
  marcadorId: string
  latitud: number
  longitud: number
  descripcion: string | null
  timestamp: string
}

export interface UsuarioPresente {
  usuarioId: number
  rolEnSala: RolSala | 'DESCONOCIDO'
}

export interface PresenciaMensaje {
  // ENTRADA/SALIDA: conexión o desconexión real de WebSocket.
  // MIEMBRO_UNIDO/MIEMBRO_SALIO/ROL_CAMBIADO: cambios de membresía (unirse, salir, ser
  // expulsado, cambio de rol) propagados desde room-service.
  tipo: 'ENTRADA' | 'SALIDA' | 'MIEMBRO_UNIDO' | 'MIEMBRO_SALIO' | 'ROL_CAMBIADO'
  usuarioId: number
  presentes: UsuarioPresente[]
}

export interface CursorMensaje {
  usuarioId: number
  x: number
  y: number
}

export type EstadoConexion = 'conectando' | 'conectado' | 'desconectado' | 'error'

export interface ParticipanteVoz {
  usuarioId: number
  muteado: boolean
}

export interface VozMensaje {
  tipo: 'ENTRO' | 'SALIO' | 'SILENCIO_CAMBIADO'
  usuarioId: number
  participantes: ParticipanteVoz[]
}

export interface VozSenalMensaje {
  tipo: 'OFERTA' | 'RESPUESTA' | 'ICE'
  salaId: number
  canalId: string
  deUsuarioId: number
  sdp?: string
  candidato?: RTCIceCandidateInit
}
