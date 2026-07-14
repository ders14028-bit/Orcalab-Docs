import { apiFetch } from '../../lib/http'
import type { Alerta, Marcador, Mensaje } from '../../types/realtime'

export function obtenerMensajes(salaId: number, canalId: string): Promise<Mensaje[]> {
  return apiFetch<Mensaje[]>(`/api/salas/${salaId}/canales/${canalId}/mensajes`)
}

export function obtenerMarcadores(salaId: number): Promise<Marcador[]> {
  return apiFetch<Marcador[]>(`/api/salas/${salaId}/marcadores`)
}

export function eliminarMarcador(salaId: number, marcadorId: string): Promise<void> {
  return apiFetch<void>(`/api/salas/${salaId}/marcadores/${marcadorId}`, { method: 'DELETE' })
}

export function obtenerAlertas(salaId: number): Promise<Alerta[]> {
  return apiFetch<Alerta[]>(`/api/salas/${salaId}/alertas`)
}
