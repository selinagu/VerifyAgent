type Props = {
  prompt: string;
  disabled: boolean;
  busy: boolean;
  onPromptChange(value: string): void;
  onSubmit(): void;
};

export function RequestComposer({ prompt, disabled, busy, onPromptChange, onSubmit }: Props) {
  return (
    <section className="panel p-6" aria-labelledby="request-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Natural-language request</p>
          <h2 id="request-heading" className="mt-2 text-xl font-semibold text-white">What should the agent prepare?</h2>
        </div>
        <span className="trust-chip">Plan only</span>
      </div>
      <label htmlFor="agent-request" className="sr-only">Agent request</label>
      <textarea
        id="agent-request"
        rows={3}
        value={prompt}
        disabled={disabled}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !disabled && prompt.trim()) onSubmit();
        }}
        className="mt-5 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-4 text-base leading-7 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
        placeholder="Describe the marketplace action you want…"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Press Ctrl/⌘ + Enter to create a plan.</p>
        <button type="button" className="primary-button" disabled={disabled || !prompt.trim()} onClick={onSubmit}>
          {busy ? "Creating secure plan…" : "Create action plan"}
        </button>
      </div>
    </section>
  );
}
