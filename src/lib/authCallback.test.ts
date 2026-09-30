import { describe, expect, it } from 'vitest'
import { callbackErrorCode, signInErrorMessage, signInFailureMessage } from './authCallback'

describe('callbackErrorCode', () => {
  it('is null for a successful callback', () => {
    expect(callbackErrorCode('?code=abc', '')).toBeNull()
    expect(callbackErrorCode('', '#access_token=x&refresh_token=y')).toBeNull()
  })

  it('reads an expired magic link from the hash or the query', () => {
    expect(callbackErrorCode('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe('link-expired')
    expect(callbackErrorCode('?error=access_denied&error_code=otp_expired', '')).toBe('link-expired')
  })

  it('reports any other error as a failed sign-in', () => {
    expect(callbackErrorCode('?error=server_error&error_description=boom', '')).toBe('sign-in-failed')
  })
})

describe('signInErrorMessage', () => {
  it('maps known codes and ignores anything else', () => {
    expect(signInErrorMessage('link-expired')).toMatch(/expired/)
    expect(signInErrorMessage('sign-in-failed')).toMatch(/try again/i)
    expect(signInErrorMessage('<script>')).toBeNull()
    expect(signInErrorMessage(null)).toBeNull()
  })
})

describe('signInFailureMessage', () => {
  it('explains a rate limit', () => {
    expect(signInFailureMessage({ message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' })).toMatch(/wait a minute/i)
  })

  it('explains a bad address', () => {
    expect(signInFailureMessage({ message: 'Email address "x@y" is invalid', status: 400, code: 'email_address_invalid' })).toMatch(/doesn't look right/)
  })

  it('explains a network failure', () => {
    expect(signInFailureMessage({ message: 'Failed to fetch' })).toMatch(/connection/)
  })

  it('never shows the raw message for anything else', () => {
    expect(signInFailureMessage({ message: 'unexpected_failure: boom', status: 500 })).toBe("Couldn't send the link. Try again in a moment.")
  })
})
