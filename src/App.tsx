import { useState } from 'react'
import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { ArchipelagoScene } from './features/archipelago/ArchipelagoScene'
import { HomeOverlay } from './features/archipelago/HomeOverlay'
import { NotFoundPage } from './features/NotFoundPage'

export function App() {
  const [showCompleted, setShowCompleted] = useState(true)
  const toggleShowCompleted = () => setShowCompleted((value) => !value)

  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <ArchipelagoScene showCompleted={showCompleted} />
            <div className="pointer-events-none fixed inset-0">
              <Routes>
                <Route
                  path="/"
                  element={<HomeOverlay showCompleted={showCompleted} onToggleShowCompleted={toggleShowCompleted} />}
                />
                <Route
                  path="/g/:id"
                  element={<HomeOverlay showCompleted={showCompleted} onToggleShowCompleted={toggleShowCompleted} />}
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </div>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
