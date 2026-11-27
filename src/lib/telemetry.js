/**
 * Maç içi telemetri (zaman damgalı eylemler).
 * Kayıt alanı: rec.timeline = [{ t: saniye, a: 'auto_score' | 'teleop_score' | 'flower_done' | 'flower_fail' | 'tag:<id>' }]
 * Yalnızca maç ekranında saat çalışırken yazılır; eski kayıtlarda alan yoktur (→ boş kabul edilir).
 *
 * Ölü süre: TeleOp penceresinde (otonom + geçişten sonra, maç sonuna kadar) iki skor arasındaki
 * DEAD_GAP saniyeden uzun boşluklar (pencerenin başı ve sonu dahil). Aktiflik = 1 − ölü / TeleOp süresi.
 */
import { MATCH_TIMING } from '../components/MatchMode.jsx';

export const TELE_START = MATCH_TIMING.auto + MATCH_TIMING.transition;
export const MATCH_END = TELE_START + MATCH_TIMING.teleop;
export const DEAD_GAP = 20;

export function matchActivity(timeline) {
  if (!timeline?.length) return null;
  const scores = timeline.filter((e) => e.a === 'teleop_score' && e.t >= TELE_START && e.t <= MATCH_END).map((e) => e.t).sort((a, b) => a - b);
  const marks = [TELE_START, ...scores, MATCH_END];
  const dead = [];
  for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > DEAD_GAP) dead.push([marks[i - 1], marks[i]]);
  const deadSec = dead.reduce((s, [a, b]) => s + (b - a), 0);
  return { active: 1 - deadSec / MATCH_TIMING.teleop, dead, deadSec, scores: scores.length, events: timeline };
}

export function teamActivity(records) {
  const rows = records.map((r) => ({ match: r.match.matchNumber, ...matchActivity(r.timeline) })).filter((x) => x.events);
  if (!rows.length) return null;
  return { rows, avg: rows.reduce((s, r) => s + r.active, 0) / rows.length };
}
