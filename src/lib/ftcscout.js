/**
 * FTCScout REST API (https://api.ftcscout.org/rest/v1) – anahtar gerektirmez, CORS açık.
 * Kullanılan uçlar (doğrulandı):
 *   GET /events/search/{season}?searchText=..&limit=..   → etkinlik listesi
 *   GET /events/{season}/{code}/matches                  → maç programı + skorlar
 *   GET /events/{season}/{code}/teams                    → etkinlikteki takımlar + sıralama
 * Skor alanları sezona göre değişir; burada sezondan bağımsız olanlar kullanılır:
 *   totalPoints, totalPointsNp, autoPoints, dcPoints.
 * Son başarılı cevap cihazda saklanır → internet yokken de program görüntülenir.
 * The Orange Alliance entegrasyonu eklenmedi (servisin güncel durumu doğrulanamadı).
 */
const BASE = 'https://api.ftcscout.org/rest/v1';
const CACHE_KEY = (s, c) => `bb2.ftcscout.${s}.${c}`;

async function get(path) {
  let res;
  try {
    res = await fetch(BASE + path, { cache: 'no-store' });
  } catch {
    throw new Error('FTCScout’a ulaşılamadı (internet yok mu?)');
  }
  if (res.status === 404) throw new Error((await res.text()) || 'Bulunamadı');
  if (!res.ok) throw new Error(`FTCScout hatası (${res.status})`);
  return res.json();
}

export const searchEvents = (season, text) =>
  get(`/events/search/${season}?limit=20${text ? `&searchText=${encodeURIComponent(text)}` : ''}`);

const levelPrefix = (lvl) => ({ Quals: 'Q', Semis: 'SF', Finals: 'F', DoubleElim: 'P', Playoffs: 'P' }[lvl] || (lvl || 'M').slice(0, 2));

/** API maçını uygulamanın kullandığı sade biçime çevirir */
export function normalizeMatch(m) {
  const side = (color) => {
    const teams = (m.teams || [])
      .filter((t) => t.alliance === color)
      .sort((a, b) => String(a.station).localeCompare(String(b.station)))
      .map((t) => String(t.teamNumber));
    const s = m.scores?.[color.toLowerCase()];
    return {
      teams,
      score: s?.totalPoints ?? null,
      scoreNp: s?.totalPointsNp ?? null,
      auto: s?.autoPoints ?? null,
      tele: s?.dcPoints ?? null,
    };
  };
  return {
    key: `${m.tournamentLevel}-${m.series}-${m.id}`,
    label: `${levelPrefix(m.tournamentLevel)}${m.tournamentLevel === 'Quals' ? m.id : `${m.series || ''}-${m.id}`}`,
    level: m.tournamentLevel,
    played: !!m.hasBeenPlayed,
    time: m.actualStartTime || m.scheduledStartTime || null,
    red: side('Red'),
    blue: side('Blue'),
  };
}

export async function loadEvent(season, code) {
  const c = code.trim().toUpperCase();
  const [matches, teams] = await Promise.all([get(`/events/${season}/${c}/matches`), get(`/events/${season}/${c}/teams`).catch(() => [])]);
  const data = {
    season,
    code: c,
    fetchedAt: new Date().toISOString(),
    matches: matches.map(normalizeMatch).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    teams: teams.map((t) => ({ number: String(t.teamNumber), rank: t.stats?.rank ?? null, wins: t.stats?.wins, losses: t.stats?.losses, ties: t.stats?.ties })),
  };
  try {
    localStorage.setItem(CACHE_KEY(season, c), JSON.stringify(data));
  } catch { /* depolama dolu */ }
  return data;
}

export function cachedEvent(season, code) {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY(season, code.trim().toUpperCase())));
  } catch {
    return null;
  }
}
