import React, { useMemo, useState } from 'react';
import { predictMatch } from '../lib/analytics.js';
import { cachedEvent, loadEvent, searchEvents } from '../lib/ftcscout.js';

/**
 * Turnuva programı + resmi skorlar (FTCScout). İnternet varken çekilir, cihazda saklanır.
 * Her maç için bizim scouting verimizle (mevcut predictMatch) tahmin gösterilir; oynanmışsa
 * gerçek skorla karşılaştırılır → tahmin isabeti.
 */
const PREF = 'bb2.event.last';
const readPref = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF)) || {};
  } catch {
    return {};
  }
};

export default function EventSchedule({ stats, myTeam }) {
  const last = readPref();
  const [season, setSeason] = useState(last.season || new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0));
  const [code, setCode] = useState(last.code || '');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [event, setEvent] = useState(() => (last.code ? cachedEvent(last.season, last.code) : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  async function load(c = code) {
    if (!c.trim()) return setErr('Etkinlik kodu girin');
    setBusy(true);
    setErr('');
    try {
      const ev = await loadEvent(season, c);
      setEvent(ev);
      setCode(ev.code);
      setFound([]);
      localStorage.setItem(PREF, JSON.stringify({ season, code: ev.code }));
    } catch (e) {
      const cached = cachedEvent(season, c);
      if (cached) {
        setEvent(cached);
        setErr(`${e.message} – kayıtlı program gösteriliyor (${cached.fetchedAt.slice(0, 16).replace('T', ' ')})`);
      } else setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setBusy(true);
    setErr('');
    try {
      setFound(await searchEvents(season, query.trim()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const byNum = useMemo(() => Object.fromEntries(stats.map((t) => [t.num, t])), [stats]);
  const matches = (event?.matches || []).filter((m) => !onlyMine || !myTeam || [...m.red.teams, ...m.blue.teams].includes(String(myTeam)));

  const rows = matches.map((m) => {
    const R = m.red.teams.map((n) => byNum[n]).filter(Boolean);
    const B = m.blue.teams.map((n) => byNum[n]).filter(Boolean);
    const complete = R.length === m.red.teams.length && B.length === m.blue.teams.length && R.length > 0;
    const pred = R.length && B.length ? predictMatch(R, B) : null;
    const actualWinner = m.played && m.red.score != null ? (m.red.score > m.blue.score ? 'red' : m.red.score < m.blue.score ? 'blue' : 'tie') : null;
    const predWinner = pred ? (pred.pRed >= 0.5 ? 'red' : 'blue') : null;
    return { m, pred, complete, hit: actualWinner && predWinner && actualWinner !== 'tie' ? actualWinner === predWinner : null };
  });
  const judged = rows.filter((r) => r.hit != null && r.complete);
  const accuracy = judged.length ? judged.filter((r) => r.hit).length / judged.length : null;

  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-bold">📅 Turnuva Programı (FTCScout)</h2>
      <div className="grid grid-cols-[90px_1fr_auto] gap-2">
        <input className="input" inputMode="numeric" value={season} onChange={(e) => setSeason(Number(e.target.value.replace(/\D/g, '')) || '')} aria-label="Sezon" />
        <input className="input uppercase" placeholder="Etkinlik kodu (örn. TRIST)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn-primary" disabled={busy} onClick={() => load()}>{busy ? '⏳' : 'Getir'}</button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input className="input" placeholder="Kodu bilmiyor musunuz? Etkinlik ara (örn. Turkey, Istanbul)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
        <button className="btn-ghost" disabled={busy} onClick={search}>🔍</button>
      </div>
      <p className="text-xs text-muted">Sezon = sezonun başladığı yıl (2026–27 sezonu için 2026).</p>
      {found.length > 0 && (
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {found.map((e) => (
            <button key={e.code} className="rounded-xl bg-raised p-3 text-left text-sm" onClick={() => load(e.code)}>
              <b>{e.code}</b> · {e.name}
              <div className="text-xs text-muted">{e.city}, {e.country} · {e.start}{e.hasMatches ? '' : ' · program yok'}</div>
            </button>
          ))}
        </div>
      )}
      {err && <p className="rounded-xl bg-bad/15 p-3 text-sm text-bad">{err}</p>}

      {event && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>{event.code}</b>
            <span className="text-muted">· {event.matches.length} maç · güncelleme {event.fetchedAt.slice(11, 16)}</span>
            {accuracy != null && <span className="rounded-full bg-ok/20 px-2 py-0.5">Tahmin isabeti %{Math.round(accuracy * 100)} ({judged.length} maç)</span>}
            {myTeam && (
              <label className="ml-auto flex items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                Sadece #{myTeam}
              </label>
            )}
          </div>
          {!event.matches.length && <p className="text-sm text-muted">Bu etkinlik için henüz maç programı yayınlanmamış.</p>}
          <div className="grid gap-2">
            {rows.map(({ m, pred, complete, hit }) => (
              <div key={m.key} className="rounded-xl border border-line bg-raised p-3 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <b className="text-base">{m.label}</b>
                  {m.time && <span className="text-xs text-muted">{new Date(m.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>}
                  {hit != null && complete && <span className="ml-auto text-xs">{hit ? '✅ tahmin tuttu' : '❌ tahmin tutmadı'}</span>}
                </div>
                {['red', 'blue'].map((c) => (
                  <div key={c} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {m[c].teams.map((n) => (
                        <span
                          key={n}
                          className={`rounded-md px-2 py-0.5 font-semibold text-white ${c === 'red' ? 'bg-red-alliance' : 'bg-blue-alliance'} ${String(myTeam) === n ? 'ring-2 ring-accent' : ''} ${byNum[n] ? '' : 'opacity-60'}`}
                          title={byNum[n] ? 'Scouting verisi var' : 'Scouting verisi yok'}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted">{pred ? `tahmin ${Math.round(pred[c].mu)} · %${Math.round((c === 'red' ? pred.pRed : pred.pBlue) * 100)}` : ''}</span>
                    <span className="w-10 text-right text-lg font-extrabold tabular-nums">{m.played ? m[c].score ?? '—' : ''}</span>
                  </div>
                ))}
                {pred && !complete && <p className="mt-1 text-[11px] text-muted">Bazı takımların scouting verisi yok – tahmin eksik veriyle.</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
