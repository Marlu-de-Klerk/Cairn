import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './RequireAuth'

vi.mock('./useSession', () => ({ useSession: () => ({ session: null, isLoading: false }) }))

function Where() {
  const location = useLocation()
  return <p>at {location.pathname + location.search}</p>
}

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/sign-in" element={<Where />} />
        <Route path="/*" element={<RequireAuth>secret</RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  afterEach(() => window.history.pushState({}, '', '/'))

  it('sends a signed-out visitor to sign in', () => {
    renderAt()
    expect(screen.getByText('at /sign-in')).toBeInTheDocument()
  })

  it('carries a failed sign-in link through, wherever Supabase sent it', () => {
    window.history.pushState({}, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')
    renderAt()
    expect(screen.getByText('at /sign-in?error=link-expired')).toBeInTheDocument()
  })
})
