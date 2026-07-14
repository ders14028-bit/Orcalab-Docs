import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AdminPage } from '../features/admin/AdminPage'
import { RoomShellLayout } from '../pages/RoomShellLayout'
import { NoRoomSelected } from '../pages/NoRoomSelected'
import { ActiveRoomView } from '../pages/ActiveRoomView'
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute'

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/registro"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoomShellLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<NoRoomSelected />} />
          <Route path="salas/:salaId" element={<ActiveRoomView />} />
        </Route>
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
