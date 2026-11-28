import React, { useMemo, useState } from 'react';
import { FATIGUE_LIMIT, PRIORITY, STATIONS, consecutiveLoad, memberStats, taskProgress } from '../lib/tasks.js';
import { accounts, makeInviteBlock } from '../lib/auth.js';
import { Segmented } from './ui.jsx';

/**
 * Görevler sekmesi: Görevlerim (herkes) · Mentör Paneli (yalnız mentor) · Takım (katkı & rozetler)
 */
const TYPE_ICON = { match: '🎯', pit: '🔧', custom: '🧠' };
const fmtDue = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const mins = Math.round((d - Date.now()) / 60000);
  const rel = Math.abs(mins) < 60 ? `${Math.abs(mins)} dk` : Math.abs(mins) < 1440 ? `${Math.round(Math.abs(mins) / 60)} sa` : `${Math.round(Math.abs(mins) / 1440)} gün`;
  return { text: d.toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }), rel: mins >= 0 ? `${rel} kaldı` : `${rel} gecikti`, late: mins < 0 };
};

export default function TasksHub(props) {
  const { auth } = props;
  const [sub, setSub] = useState('mine');
  const subs = [['mine', '📋 Görevlerim'], ...(auth.rol === 'mentor' ? [['mentor', '🧑‍🏫 Mentör']] : []), ['team', '🏅 Takım']];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 rounded-2xl bg-surface p-1" style={{ gridTemplateColumns: `repeat(${subs.length}, minmax(0,1fr))` }}>
        {subs.map(([id, l]) => (
          <button key={id} onClick={() => setSub(id)} className={`min-h-[44px] rounded-xl text-sm font-bold ${sub === id ? 'bg-accent text-accent-fg' : 'text-muted'}`}>
            {l}
          </button>
        ))}
      </div>
      {sub === 'mine' && <MyTasks {...props} />}
      {sub === 'mentor' && auth.rol === 'mentor' && <MentorPanel {...props} />}
      {sub === 'team' && <TeamBoard {...props} />}
    </div>
  );
}

function useCtx({ records, pits, roster, schedule }) {
  return useMemo(() => ({ records, pits, members: roster?.members || [], schedule }), [records, pits, roster, schedule]);
}

/* ============================ GÖREVLERİM ============================ */
function MyTasks({ auth, roster, tasks, records, pits, groups, schedule, onSaveTask, goTo }) {
  const ctx = useCtx({ records, pits, roster, schedule });
  const me = roster?.members.find((m) => m.id === auth.memberId) || { id: auth.memberId, adSoyad: auth.adSoyad };
  const st = memberStats(me, { records, pits, tasks, groups, ctx });
  const mine = tasks.filter((t) => t.assignee === auth.memberId).map((t) => ({ t, p: taskProgress(t, ctx) }));
  const pool = tasks.filter((t) => t.assignee === '*').map((t) => ({ t, p: taskProgress(t, ctx) })).filter((x) => !x.p.complete);
  const cols = [
    ['pending', 'Bekleyen'],
    ['in_progress', 'Devam Eden'],
    ['done', 'Tamamlanan'],
  ];

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl font-black text-accent-fg">{auth.adSoyad.slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-extrabold">{auth.adSoyad}</div>
            <div className="text-xs text-muted">{auth.rol === 'mentor' ? '🧑‍🏫 Mentör' : '👤 Üye'} · {st.matches} maç · {st.pits} pit · {st.completed} görev</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black tabular-nums text-accent">{st.score}</div>
            <div className="text-[10px] text-muted">katkı puanı</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {st.streak > 0 && <span className="rounded-full bg-warn/20 px-3 py-1 text-xs font-bold text-warn">🔥 {st.streak} seri</span>}
          {st.badges.map((b) => (
            <span key={b.id} className="rounded-full bg-ok/15 px-3 py-1 text-xs font-bold text-ok" title={b.desc}>{b.icon} {b.label}</span>
          ))}
          {!st.badges.length && !st.streak && <span className="text-xs text-muted">Görevleri zamanında tamamlayarak rozet kazanın.</span>}
        </div>
      </section>

      {cols.map(([status, label]) => {
        const list = mine.filter((x) => x.p.status === status);
        return (
          <section key={status} className="grid gap-2">
            <h3 className="text-sm font-bold uppercase text-muted">{label} ({list.length})</h3>
            {!list.length && <p className="text-xs text-muted">—</p>}
            {list.map(({ t, p }) => (
              <TaskCard key={t.id} t={t} p={p} roster={roster} auth={auth} onSaveTask={onSaveTask} goTo={goTo} />
            ))}
          </section>
        );
      })}

      {pool.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-bold uppercase text-warn">🆘 Ortak havuz – sahipsiz görevler ({pool.length})</h3>
          {pool.map(({ t, p }) => (
            <TaskCard key={t.id} t={t} p={p} roster={roster} auth={auth} onSaveTask={onSaveTask} goTo={goTo} pool />
          ))}
        </section>
      )}
    </div>
  );
}

function TaskCard({ t, p, roster, auth, onSaveTask, goTo, pool, mentorView }) {
  const [handoff, setHandoff] = useState(false);
  const due = fmtDue(t.due);
  const pr = PRIORITY[t.priority] || PRIORITY.normal;
  const now = () => new Date().toISOString();
  const save = (patch, action, extra = {}) =>
    onSaveTask({ ...t, ...patch, updatedAt: now(), history: [...(t.history || []), { at: now(), by: auth.adSoyad, action, ...extra }] });
  const others = (roster?.members || []).filter((m) => m.id !== t.assignee);

  return (
    <div className={`grid gap-2 rounded-2xl border-2 bg-surface p-3 ${p.complete ? 'border-ok/60' : p.overdue ? 'border-bad' : pool ? 'border-warn' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        <span className="text-2xl">{p.complete ? '✅' : TYPE_ICON[t.type]}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-snug">{t.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
            <span className={`rounded-full px-2 py-0.5 font-bold ${pr.tone === 'bad' ? 'bg-bad/20 text-bad' : pr.tone === 'warn' ? 'bg-warn/20 text-warn' : 'bg-raised text-muted'}`}>{pr.label}</span>
            {due && <span className={`rounded-full px-2 py-0.5 ${due.late && !p.complete ? 'bg-bad text-white' : 'bg-raised text-muted'}`}>⏰ {due.text} · {p.complete ? (p.late ? 'geç teslim' : 'zamanında') : due.rel}</span>}
            {mentorView && <span className="rounded-full bg-raised px-2 py-0.5 text-muted">👤 {t.assignee === '*' ? 'Ortak havuz' : t.assigneeName}</span>}
          </div>
        </div>
        <span className="text-sm font-extrabold tabular-nums">{p.done}/{p.total}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${p.complete ? 'bg-ok' : p.overdue ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${(p.done / p.total) * 100}%` }} />
      </div>
      {p.items.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {p.items.map((i) => (
            <span key={i.label} className={`rounded-md px-2 py-0.5 text-xs ${i.done ? 'bg-ok/20 text-ok' : i.partial ? 'bg-warn/20 text-warn' : 'bg-raised text-muted'}`}>{i.done ? '✓ ' : ''}{i.label}</span>
          ))}
        </div>
      )}
      {!mentorView && !p.complete && (
        <div className="grid grid-cols-2 gap-2">
          {pool ? (
            <button className="btn-primary col-span-2" onClick={() => save({ assignee: auth.memberId, assigneeName: auth.adSoyad }, 'claim', { from: '*', to: auth.memberId })}>✋ Üstlen</button>
          ) : (
            <>
              {t.type === 'custom' ? (
                t.manual === 'in_progress' ? (
                  <button className="btn-primary" onClick={() => save({ manual: 'done', doneAt: now() }, 'done')}>✅ Tamamla</button>
                ) : (
                  <button className="btn-primary" onClick={() => save({ manual: 'in_progress' }, 'start')}>▶ Başla</button>
                )
              ) : (
                <button className="btn-primary" onClick={() => (t.manual !== 'in_progress' && p.status === 'pending' && save({ manual: 'in_progress' }, 'start'), goTo(t.type === 'pit' ? 'pit' : 'match'))}>
                  {t.type === 'pit' ? '🔧 Pit formuna git' : '⚡ Maça git'}
                </button>
              )}
              <button className="btn-ghost border-warn text-warn" onClick={() => setHandoff(!handoff)}>🔁 Görevi Devret</button>
            </>
          )}
        </div>
      )}
      {handoff && (
        <div className="grid gap-2 rounded-xl bg-raised p-2">
          <span className="text-xs font-bold text-muted">Kime devredilsin?</span>
          <div className="grid grid-cols-2 gap-1">
            <button className="btn min-h-[44px] border-2 border-warn text-sm text-warn" onClick={() => (save({ assignee: '*', assigneeName: 'Ortak havuz' }, 'handoff', { from: t.assignee, to: '*' }), setHandoff(false))}>
              🆘 Ortak havuz
            </button>
            {others.map((m) => (
              <button key={m.id} className="btn min-h-[44px] border-2 border-line text-sm" onClick={() => (save({ assignee: m.id, assigneeName: m.adSoyad }, 'handoff', { from: t.assignee, to: m.id }), setHandoff(false))}>
                {m.adSoyad}
              </button>
            ))}
          </div>
        </div>
      )}
      {t.history?.some((h) => h.action === 'handoff' || h.action === 'claim') && (
        <p className="text-[11px] text-muted">🔁 {t.history.filter((h) => h.action === 'handoff' || h.action === 'claim').map((h) => `${h.by} ${h.action === 'claim' ? 'üstlendi' : 'devretti'}`).join(' · ')}</p>
      )}
    </div>
  );
}

/* ============================ MENTÖR PANELİ ============================ */
function MentorPanel(props) {
  const { roster, tasks, records, pits, schedule, auth, onSaveTask, onDeleteTask } = props;
  const ctx = useCtx({ records, pits, roster, schedule });
  const [view, setView] = useState('track');
  const members = roster?.members || [];
  return (
    <div className="grid gap-3">
      <Segmented
        options={[
          { value: 'track', label: '📊 Takip' },
          { value: 'new', label: '➕ Görev Ata' },
          { value: 'members', label: '👥 Üyeler' },
        ]}
        value={view}
        onChange={(v) => v && setView(v)}
      />
      {view === 'new' && <NewTask {...props} onDone={() => setView('track')} />}
      {view === 'track' && <Track tasks={tasks} ctx={ctx} members={members} roster={roster} auth={auth} onSaveTask={onSaveTask} onDeleteTask={onDeleteTask} />}
      {view === 'members' && <Members {...props} />}
    </div>
  );
}

function Track({ tasks, ctx, members, roster, auth, onSaveTask, onDeleteTask }) {
  const rows = tasks.map((t) => ({ t, p: taskProgress(t, ctx) }));
  const per = [{ id: '*', adSoyad: 'Ortak havuz' }, ...members]
    .map((m) => {
      const r = rows.filter((x) => x.t.assignee === m.id);
      return { m, total: r.length, done: r.filter((x) => x.p.complete).length, late: r.filter((x) => x.p.overdue).length, items: r.reduce((s, x) => s + x.p.total, 0), itemsDone: r.reduce((s, x) => s + x.p.done, 0) };
    })
    .filter((x) => x.total);
  if (!rows.length) return <div className="card text-center text-muted">Henüz görev atanmadı.</div>;
  return (
    <div className="grid gap-3">
      <section className="card grid gap-2">
        <h3 className="font-bold">Canlı ilerleme</h3>
        {per.map(({ m, total, done, late, items, itemsDone }) => (
          <div key={m.id} className="grid grid-cols-[96px_1fr_auto] items-center gap-2 text-sm">
            <span className="truncate font-semibold">{m.adSoyad}</span>
            <div className="h-3 overflow-hidden rounded-full bg-raised">
              <div className={`h-full ${late ? 'bg-bad' : 'bg-ok'}`} style={{ width: `${items ? (itemsDone / items) * 100 : 0}%` }} />
            </div>
            <span className="text-xs tabular-nums">
              {done}/{total} {late > 0 && <b className="text-bad">⚠ {late} gecikti</b>}
            </span>
          </div>
        ))}
      </section>
      {rows
        .sort((a, b) => Number(a.p.complete) - Number(b.p.complete) || Number(b.p.overdue) - Number(a.p.overdue))
        .map(({ t, p }) => (
          <div key={t.id} className="grid gap-1">
            <TaskCard t={t} p={p} roster={roster} auth={auth} onSaveTask={onSaveTask} mentorView />
            <button className="justify-self-end text-xs text-muted underline" onClick={() => confirm(`“${t.title}” silinsin mi?`) && onDeleteTask(t)}>Görevi sil</button>
          </div>
        ))}
    </div>
  );
}

function NewTask({ roster, tasks, auth, session, onSaveTask, onDone, flash }) {
  const members = roster?.members || [];
  const [type, setType] = useState('match');
  const [assignee, setAssignee] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [station, setStation] = useState('red1');
  const [teams, setTeams] = useState('');
  const [photo, setPhoto] = useState(true);
  const [desc, setDesc] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');
  const [ackFatigue, setAckFatigue] = useState(false);

  const range = type === 'match' && from ? { from: +from, to: +(to || from) } : null;
  const load = range && assignee && assignee !== '*' ? consecutiveLoad(tasks, assignee, range) : 0;
  const tired = load >= FATIGUE_LIMIT;
  const who = assignee === '*' ? 'Tüm takım (ortak havuz)' : members.find((m) => m.id === assignee)?.adSoyad;
  const stationLabel = STATIONS.find((s) => s.id === station)?.label;
  const teamList = teams.split(/[\s,;]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean);
  const autoTitle =
    type === 'match'
      ? range && `Maç #${range.from}${range.to !== range.from ? `–#${range.to}` : ''} arası ${stationLabel} robotunu izle`
      : type === 'pit'
        ? teamList.length && `${teamList.join(', ')} garaj incelemesi${photo ? ' + fotoğraf' : ''}`
        : desc.slice(0, 80);

  async function create() {
    if (!assignee) return flash('Kime atanacağını seçin', 'error');
    if (type === 'match' && (!range || range.to < range.from)) return flash('Geçerli maç aralığı girin', 'error');
    if (type === 'pit' && !teamList.length) return flash('En az bir takım numarası girin', 'error');
    if (type === 'custom' && !desc.trim()) return flash('Görev açıklaması girin', 'error');
    if (tired && !ackFatigue) return flash('Yorgunluk uyarısını onaylayın', 'error');
    const now = new Date().toISOString();
    await onSaveTask({
      id: `task:${crypto.randomUUID()}`,
      kind: 'task',
      roomId: session.roomId,
      type,
      title: (title || autoTitle || 'Görev').trim(),
      assignee,
      assigneeName: who,
      priority,
      due: due ? new Date(due).toISOString() : null,
      createdBy: auth.adSoyad,
      createdAt: now,
      updatedAt: now,
      match: type === 'match' ? { ...range, station } : null,
      pit: type === 'pit' ? { teams: teamList, photo } : null,
      custom: type === 'custom' ? { description: desc.trim() } : null,
      manual: null,
      history: [{ at: now, by: auth.adSoyad, action: 'create' }],
    });
    flash('Görev atandı ✓');
    onDone();
  }

  return (
    <section className="card grid gap-3">
      <Segmented
        options={[
          { value: 'match', label: '🎯 Maç İzleme' },
          { value: 'pit', label: '🔧 Pit' },
          { value: 'custom', label: '🧠 Özel' },
        ]}
        value={type}
        onChange={(v) => v && (setType(v), setAckFatigue(false))}
      />
      <label className="grid gap-1 text-sm">
        <span className="label mb-0">Kime</span>
        <select className="input" value={assignee} onChange={(e) => (setAssignee(e.target.value), setAckFatigue(false))}>
          <option value="">— Seçin —</option>
          <option value="*">👥 Tüm takım (ortak havuz – ilk üstlenen yapar)</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.adSoyad}{m.rol === 'mentor' ? ' (mentör)' : ''}</option>
          ))}
        </select>
      </label>
      {type === 'match' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm"><span className="label mb-0">Maç #'dan</span><input className="input text-center text-xl font-bold" inputMode="numeric" value={from} onChange={(e) => (setFrom(e.target.value.replace(/\D/g, '')), setAckFatigue(false))} /></label>
            <label className="grid gap-1 text-sm"><span className="label mb-0">Maç #'a</span><input className="input text-center text-xl font-bold" inputMode="numeric" value={to} placeholder={from} onChange={(e) => (setTo(e.target.value.replace(/\D/g, '')), setAckFatigue(false))} /></label>
          </div>
          <Segmented options={STATIONS.map((s) => ({ value: s.id, label: s.label }))} value={station} onChange={(v) => v && setStation(v)} cols={2} tone={(v) => (v.startsWith('red') ? 'border-red-alliance bg-red-alliance text-white' : 'border-blue-alliance bg-blue-alliance text-white')} />
          <p className="-mt-1 text-xs text-muted">Turnuva programı yüklüyse istasyondaki takım otomatik eşleşir; değilse yalnızca maç numarası kontrol edilir.</p>
        </>
      )}
      {type === 'pit' && (
        <>
          <label className="grid gap-1 text-sm"><span className="label mb-0">Takım numaraları (virgülle)</span><input className="input" inputMode="numeric" value={teams} onChange={(e) => setTeams(e.target.value)} placeholder="19452, 21045, 18230" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Fotoğraf da zorunlu</label>
        </>
      )}
      {type === 'custom' && (
        <label className="grid gap-1 text-sm"><span className="label mb-0">Görev</span><textarea className="input min-h-[80px]" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Eleme öncesi en iyi 5 otonom yapan takımı Picklist'te işaretle" /></label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm"><span className="label mb-0">Son teslim</span><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">
          <span className="label mb-0">Öncelik</span>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm"><span className="label mb-0">Başlık (boş = otomatik)</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle || ''} /></label>

      {tired && (
        <div className="grid gap-2 rounded-2xl border-2 border-warn bg-warn/10 p-3 text-sm">
          <b className="text-warn">⚠ Dikkat: Bu üyeye üst üste çok fazla maç atandı ({load} maç), mola vermesi önerilir.</b>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={ackFatigue} onChange={(e) => setAckFatigue(e.target.checked)} /> Biliyorum, yine de ata</label>
        </div>
      )}
      <button className="btn-primary min-h-[56px] text-lg" onClick={create}>📤 Görevi Ata</button>
    </section>
  );
}

function Members({ roster, onResetAccount, flash }) {
  const acc = accounts();
  const [code, setCode] = useState('');
  const [block, setBlock] = useState('');
  return (
    <div className="grid gap-3">
      <section className="card grid gap-2">
        <h3 className="font-bold">Üyeler ({roster?.members.length || 0})</h3>
        <p className="-mt-1 text-xs text-muted">Üye eklemek/çıkarmak ve rol vermek için GitHub'da <code>public/team-members.json</code> dosyasını düzenleyin.</p>
        {roster?.members.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate"><b>{m.adSoyad}</b> <span className="text-xs text-muted">{m.rol === 'mentor' ? 'Mentör' : 'Üye'}{m.gitHubKullaniciAdi ? ` · @${m.gitHubKullaniciAdi}` : ''}</span></span>
            {acc.has(m.id) ? <span className="text-xs text-ok">● aktif</span> : <span className="text-xs text-muted">○ aktif değil</span>}
            {acc.has(m.id) && (
              <button className="text-xs text-bad underline" onClick={() => confirm(`${m.adSoyad} için PIN sıfırlansın mı? Üye yeniden “Kayıt Ol” yapmalı.`) && (onResetAccount(m.id), flash('PIN sıfırlandı'))}>PIN sıfırla</button>
            )}
          </div>
        ))}
      </section>
      <section className="card grid gap-2">
        <h3 className="font-bold">Davet kodunu değiştir</h3>
        <p className="-mt-1 text-xs text-muted">Yeni kodu yazın; oluşan bloğu team-members.json içindeki <code>inviteCode</code> alanına yapıştırıp GitHub'da kaydedin.</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="QB37-YENI-KOD1" />
          <button className="btn-ghost" disabled={code.trim().length < 8} onClick={async () => setBlock(JSON.stringify(await makeInviteBlock(code), null, 2))}>Oluştur</button>
        </div>
        {block && <textarea readOnly className="input h-32 font-mono text-xs" value={`"inviteCode": ${block}`} onFocus={(e) => e.target.select()} />}
      </section>
    </div>
  );
}

/* ============================ TAKIM PANOSU ============================ */
function TeamBoard({ roster, tasks, records, pits, groups, schedule, auth }) {
  const ctx = useCtx({ records, pits, roster, schedule });
  const rows = (roster?.members || []).map((m) => ({ m, s: memberStats(m, { records, pits, tasks, groups, ctx }) })).sort((a, b) => b.s.score - a.s.score);
  return (
    <section className="card grid gap-2">
      <h3 className="font-bold">🏅 Takım içi katkı</h3>
      <p className="-mt-1 text-xs text-muted">Puan: maç gözlemi 10 · pit 15 (+5 fotoğraf) · tamamlanan görev 20 (+10 zamanında) · doğrulanmış çift gözlem 5</p>
      {rows.map(({ m, s }, i) => (
        <div key={m.id} className={`grid gap-1 rounded-xl p-3 ${m.id === auth.memberId ? 'border-2 border-accent bg-accent/10' : 'bg-raised'}`}>
          <div className="flex items-center gap-2">
            <span className="w-6 text-lg font-black text-muted">{i + 1}</span>
            <b className="min-w-0 flex-1 truncate">{m.adSoyad}</b>
            {s.streak > 0 && <span className="text-xs font-bold text-warn">🔥{s.streak}</span>}
            <span className="text-xl font-black tabular-nums text-accent">{s.score}</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-8 text-[11px]">
            <span className="text-muted">{s.matches} maç · {s.pits} pit · {s.completed}/{s.completed + s.open} görev{s.overdue ? ` · ${s.overdue} gecikmiş` : ''}</span>
            {s.badges.map((b) => <span key={b.id} className="rounded-full bg-ok/15 px-2 text-ok" title={b.desc}>{b.icon} {b.label}</span>)}
          </div>
        </div>
      ))}
    </section>
  );
}
