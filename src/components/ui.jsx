import React, { useState } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');

/** Katlanabilir kategori kartı */
export function Section({ title, icon, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-2xl" aria-hidden>{icon}</span>
        <h2 className="flex-1 text-lg font-bold sm:text-xl">{title}</h2>
        {badge}
        <span className={cx('text-muted transition-transform', open && 'rotate-180')} aria-hidden>▾</span>
      </button>
      {open && <div className="mt-4 grid gap-5">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, error, children, disabled }) {
  return (
    <div className={cx(disabled && 'pointer-events-none opacity-40')} aria-disabled={disabled}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-sm font-semibold text-bad">{error}</p>}
    </div>
  );
}

/**
 * Büyük dokunmatik seçenek düğmeleri. Seçili olana tekrar dokunmak seçimi kaldırır.
 * tone: seçeneğe özel renk sınıfı döndüren fonksiyon (ör. ittifak renkleri)
 */
export function Segmented({ options, value, onChange, tone, cols }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols || Math.min(options.length, 4)}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : o.value)}
            className={cx(
              'btn min-h-[52px] border-2 px-2 text-sm sm:text-base',
              active
                ? tone?.(o.value) || 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-raised text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const YN = [
  { value: true, label: 'Evet' },
  { value: false, label: 'Hayır' },
];
export function YesNo({ value, onChange }) {
  return (
    <Segmented
      options={YN}
      value={value}
      onChange={onChange}
      tone={(v) => (v ? 'border-ok bg-ok text-black' : 'border-bad bg-bad text-white')}
    />
  );
}

/** Evet/Hayır satırı: etiket solda, düğmeler sağda (geniş ekranlarda) */
export function YesNoRow({ label, value, onChange, disabled }) {
  return (
    <div
      className={cx(
        'grid items-center gap-2 sm:grid-cols-[1fr_minmax(0,240px)]',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <span className="font-medium">{label}</span>
      <YesNo value={value} onChange={onChange} />
    </div>
  );
}

/** - / + sayaç */
export function Counter({ value, onChange, min = 0, max = 99 }) {
  const set = (n) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        className="btn-ghost w-16 text-3xl"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label="Azalt"
      >
        −
      </button>
      <input
        inputMode="numeric"
        className="input w-20 text-center text-2xl font-bold tabular-nums"
        value={value}
        onChange={(e) => set(parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        className="btn-primary w-16 text-3xl"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label="Artır"
      >
        +
      </button>
    </div>
  );
}

/** 1–5 yıldız. Aynı yıldıza tekrar dokunmak puanı sıfırlar. */
export function Stars({ value, onChange }) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} yıldız`}
          onClick={() => onChange(value === n ? 0 : n)}
          className={cx(
            'h-14 w-14 rounded-xl text-4xl leading-none transition active:scale-90',
            n <= value ? 'text-accent' : 'text-line',
          )}
        >
          ★
        </button>
      ))}
      <span className="ml-2 self-center text-lg font-bold tabular-nums text-muted">
        {value ? `${value}/5` : '—'}
      </span>
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 5, suffix = '%' }) {
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-16 text-right text-2xl font-bold tabular-nums">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        className={cx(
          'rounded-xl px-5 py-3 font-semibold shadow-2xl',
          toast.type === 'error' ? 'bg-bad text-white' : 'bg-ok text-black',
        )}
      >
        {toast.text}
      </div>
    </div>
  );
}
