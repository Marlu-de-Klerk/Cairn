import { useContext } from 'react'
import { AuthContext } from './AuthProvider'

export function useSession() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useSession must be used within an AuthProvider')
  }
  return context
}
