/** No goals yet: the island that's waiting, and the way to plant it. */
export function EmptyArchipelago({ onPlant }: { onPlant: () => void }) {
  return (
    <div className="pointer-events-none flex h-full items-center justify-center px-5">
      <div className="pointer-events-auto flex max-w-xs animate-rise flex-col items-center rounded-3xl border border-stone-light bg-stone/85 px-6 pb-6 pt-4 text-center text-mist shadow-xl backdrop-blur-md">
        <img src="/images/signin-island.webp" alt="" width={560} height={427} className="w-44 animate-float opacity-90 drop-shadow-[0_16px_20px_rgba(0,0,0,0.4)]" />
        <p className="mt-1 font-display text-xl font-medium">One island is waiting.</p>
        <p className="mt-1 text-sm text-mist/70">Every goal becomes an island, and every step a cairn on its trail. Plant your first one to begin.</p>
        <button
          type="button"
          onClick={onPlant}
          className="mt-4 rounded-full bg-lantern px-5 py-2.5 font-display text-base font-medium text-ink shadow-md hover:brightness-105"
        >
          Plant your first goal
        </button>
      </div>
    </div>
  )
}
