import { Routes, Route } from 'react-router'
import { SignInPage } from './features/auth/SignInPage'
import { AuthCallbackPage } from './features/auth/AuthCallbackPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { HomePage } from './features/home/HomePage'

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
