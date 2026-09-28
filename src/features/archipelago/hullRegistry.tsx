import { createContext, useCallback, useContext, useMemo, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Object3D } from 'three'

interface HullRegistry {
  readonly hulls: RefObject<Object3D[]>
  register(mesh: Object3D): () => void
}

const Context = createContext<HullRegistry | null>(null)

/** Labels occlude against these ~600-triangle hulls, not the full terrain (spec §5.2). */
export function HullRegistryProvider({ children }: { children: ReactNode }) {
  const hulls = useRef<Object3D[]>([])
  const register = useCallback((mesh: Object3D) => {
    hulls.current.push(mesh)
    return () => {
      hulls.current = hulls.current.filter((m) => m !== mesh)
    }
  }, [])
  const value = useMemo(() => ({ hulls, register }), [register])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useHullRegistry(): HullRegistry {
  const registry = useContext(Context)
  if (!registry) throw new Error('useHullRegistry must be used inside HullRegistryProvider')
  return registry
}
