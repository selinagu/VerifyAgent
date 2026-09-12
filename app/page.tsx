export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-20">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-300">
          Human-authorized AI actions
        </p>
        <h1 className="text-5xl font-semibold tracking-tight">VerifyAgent</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          The Phase 0 foundation is ready: typed action contracts, persistent domain models,
          validated configuration, and a testable application skeleton.
        </p>
        <div className="mt-8 inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-200">
          Phase 0 ready
        </div>
      </section>
    </main>
  );
}
