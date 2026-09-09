import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sign-in form', () => {
    render(<SignInPage />)

    expect(screen.getByRole('heading', { name: 'Cairn' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send me a sign-in link' })).toBeInTheDocument()
  })

  it('sends a magic link and shows confirmation', async () => {
    render(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'runner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))

    await waitFor(() => {
      expect(screen.getByText(/Check runner@example.com for a sign-in link/)).toBeInTheDocument()
    })

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'runner@example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('starts the Google OAuth flow', async () => {
    render(<SignInPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    await waitFor(() => {
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    })
  })
})
