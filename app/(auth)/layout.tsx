export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-paper)] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-bold text-[color:var(--color-accent-fg)]">
            R
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Roster</span>
        </div>
        {children}
      </div>
    </div>
  );
}
