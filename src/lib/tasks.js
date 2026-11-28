/**
 * Mentör Görevlendirme (Faz 6)
 * ----------------------------
 * Görevler oda kayıtları arasında `kind: 'task'` olarak tutulur → mevcut senkronizasyon, şifreleme
 * (özel oda), offline kuyruk ve QR/metin aktarımıyla aynen taşınır.
 *
 *   { id, kind:'task', roomId, type:'match'|'pit'|'custom', title, assignee: memberId | '*' (ortak havuz),
 *     assigneeName, priority:'low'|'normal'|'high', due: ISO|null, createdBy, createdAt, updatedAt,
 *     match:  { from, to, station: 'red1'|'red2'|'blue1'|'blue2'|null },
 *     pit:    { teams: ['19452', ...], photo: true },
 *     custom: { description },
 *     manual: 'in_progress'|'done'|null,   ← yalnızca özel görevlerde ya da "başladım" işaretinde
 *     doneAt, history: [{ at, by, action, from?, to? }] }
 *
 * Tamamlanma maç/pit görevlerinde KAYITLARDAN otomatik türetilir (yazılmaz): üye maçı/pit formunu
 * kaydettiği an – QR ile mentör cihazına geldiği an – ilerleme güncellenir.
 */
export const STATIONS = [
  { id: 'red1', label: 'Kırmızı 1', color: 'red', idx: 0 },
  { id: 'red2', label: 'Kırmızı 2', color: 'red', idx: 1 },
  { id: 'blue1', label: 'Mavi 1', color: 'blue', idx: 0 },
  { id: 'blue2', label: 'Mavi 2', color: 'blue', idx: 1 },
];
export const PRIORITY = { high: { label: 'Yüksek', tone: 'bad' }, normal: { label: 'Normal', tone: 'warn' }, low: { label: 'Düşük', tone: 'muted' } };

const matchNo = (m) => {
  const s = String(m || '').toUpperCase().trim();
  return /^(Q)?\d+$/.test(s) ? parseInt(s.replace(/\D/g, ''), 10) : null;
};
export const byMember = (r, member) => !!member && (r.scouterId === member.id || (!r.scouterId && r.scouter === member.adSoyad));

/** Görevin ilerlemesi: { done, total, items: [{label, done}], status } */
export function taskProgress(task, { records, pits, members, schedule }) {
  const member = task.assignee === '*' ? null : members.find((m) => m.id === task.assignee);
  let items = [];
  if (task.type === 'match') {
    const st = STATIONS.find((s) => s.id === task.match.station);
    for (let n = task.match.from; n <= task.match.to; n++) {
      const sched = schedule?.matches.find((m) => m.label.toUpperCase() === `Q${n}`);
      const team = st && sched ? sched[st.color].teams[st.idx] : null;
      const hit = records.find(
        (r) => matchNo(r.match.matchNumber) === n && (!member || byMember(r, member)) && (!team || String(r.match.teamNumber) === team),
      );
      items.push({ label: `Q${n}${team ? ` · #${team}` : ''}`, done: !!hit, at: hit?.createdAt || hit?.updatedAt });
    }
  } else if (task.type === 'pit') {
    items = task.pit.teams.map((t) => {
      const p = pits.find((x) => String(x.team?.number) === String(t));
      const done = !!p && (!task.pit.photo || !!p.pit?.photo);
      return { label: `#${t}${task.pit.photo ? ' 📷' : ''}`, done, partial: !!p && !done, at: p?.updatedAt };
    });
  } else {
    items = [{ label: task.custom?.description || task.title, done: task.manual === 'done', at: task.doneAt }];
  }
  const done = items.filter((i) => i.done).length;
  const total = items.length || 1;
  const complete = done >= total;
  const started = done > 0 || task.manual === 'in_progress' || items.some((i) => i.partial);
  const overdue = !complete && task.due && new Date(task.due) < new Date();
  // Tamamlanma anı = son tamamlanan öğenin kayıt zamanı (zamanında mı? hesabı için)
  const doneAt = complete ? items.map((i) => i.at).filter(Boolean).sort().pop() || task.doneAt || null : null;
  const late = complete && task.due && doneAt && new Date(doneAt) > new Date(task.due);
  return { done, total, items, complete, overdue, late, doneAt, status: complete ? 'done' : started ? 'in_progress' : 'pending' };
}

/**
 * Yorgunluk koruması: bu üyeye (yeni görev dahil) arka arkaya kaç maç düşüyor?
 * Döner: en uzun kesintisiz maç serisi uzunluğu.
 */
export function consecutiveLoad(tasks, memberId, newRange) {
  const nums = new Set();
  for (const t of tasks) {
    if (t.type !== 'match' || t.assignee !== memberId || t.deleted) continue;
    for (let n = t.match.from; n <= t.match.to; n++) nums.add(n);
  }
  if (newRange) for (let n = newRange.from; n <= newRange.to; n++) nums.add(n);
  const sorted = [...nums].sort((a, b) => a - b);
  // Kesintisiz serileri çıkar; yeni aralık verildiyse YALNIZCA onunla kesişen seriye bak
  const runs = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  const relevant = newRange ? runs.filter(([a, b]) => a <= newRange.to && b >= newRange.from) : runs;
  return Math.max(0, ...relevant.map(([a, b]) => b - a + 1));
}
export const FATIGUE_LIMIT = 4;

/**
 * Katkı puanı ve rozetler
 *  puan: maç kaydı 10 · pit kaydı 15 (+5 fotoğraf) · tamamlanan görev 20 (+10 zamanında) · doğrulanmış çift gözlem 5
 */
export function memberStats(member, { records, pits, tasks, groups, ctx }) {
  const mine = records.filter((r) => byMember(r, member));
  const myPits = pits.filter((p) => byMember(p, member));
  const myTasks = tasks.filter((t) => t.assignee === member.id);
  const prog = myTasks.map((t) => ({ t, p: taskProgress(t, ctx) }));
  const completed = prog.filter((x) => x.p.complete);
  const onTime = (x) => !x.p.late;
  const verifiedIn = groups.filter((g) => g.status === 'verified' && g.records.some((r) => byMember(r, member))).length;
  const anomalyIn = groups.filter((g) => g.status === 'anomaly' && g.records.some((r) => byMember(r, member))).length;

  // Seri: zamanında tamamlanan görevler, son teslim / oluşturma sırasına göre ardışık
  const ordered = completed.sort((a, b) => (a.t.due || a.t.createdAt).localeCompare(b.t.due || b.t.createdAt));
  let streak = 0;
  for (const x of ordered) streak = onTime(x) ? streak + 1 : 0;
  const overdueOpen = prog.filter((x) => x.p.overdue).length;
  if (overdueOpen) streak = 0;

  const score =
    mine.length * 10 + myPits.length * 15 + myPits.filter((p) => p.pit?.photo).length * 5 + completed.length * 20 + completed.filter(onTime).length * 10 + verifiedIn * 5;

  const badges = [];
  if (verifiedIn >= 3 && verifiedIn >= anomalyIn * 3) badges.push({ id: 'eye', icon: '🎯', label: 'Keskin Göz', desc: `${verifiedIn} doğrulanmış çift gözlem` });
  if (myPits.filter((p) => p.pit?.photo).length >= 5) badges.push({ id: 'pit', icon: '🔧', label: 'Pit Uzmanı', desc: '5+ fotoğraflı pit incelemesi' });
  if (streak >= 5) badges.push({ id: 'streak', icon: '🔥', label: "5'te 5 Seri", desc: `${streak} görev üst üste zamanında` });
  if (mine.length >= 20) badges.push({ id: 'marathon', icon: '🏃', label: 'Maratoncu', desc: '20+ maç gözlemi' });
  if (completed.length >= 1) badges.push({ id: 'first', icon: '✅', label: 'İlk Görev', desc: 'İlk görev tamamlandı' });

  return { matches: mine.length, pits: myPits.length, completed: completed.length, open: prog.length - completed.length, overdue: overdueOpen, streak, score, badges, verifiedIn };
}
