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

  it('explains an expired sign-in link passed back from the callback', () => {
    window.history.pushState({}, '', '/sign-in?error=link-expired')
    try {
      render(<SignInPage />)
      expect(screen.getByRole('alert')).toHaveTextContent(/expired or was already used/)
    } finally {
      window.history.pushState({}, '', '/')
    }
  })

  it('sends a magic link and shows confirmation', async () => {
    render(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'runner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument()
      expect(screen.getByText('runner@example.com')).toBeInTheDocument()
    })

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'runner@example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('shows a plain-language message when sending fails', async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' },
    } as never)
    render(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'runner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/wait a minute/i))
  })

  it('offers a different email after sending', async () => {
    render(<SignInPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'runner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use a different email' }))

    expect(screen.getByLabelText('Email')).toHaveValue('runner@example.com')
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
