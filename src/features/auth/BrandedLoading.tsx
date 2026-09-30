/** The full-screen wait while the session loads or a sign-in completes: the wordmark, gently pulsing. */
export function BrandedLoading({ message }: { message: string }) {
  return (
    <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-ink text-mist">
      <p className="animate-pulse font-display text-4xl font-semibold tracking-tight">Cairn</p>
      <p className="text-sm text-mist/60">{message}</p>
    </div>
  )
}
