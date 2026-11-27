/**
 * Hızlı Metin Kodu (QR'sız yedek aktarım)
 *   BBT1.P.<gövde>              Ortak oda: sıkıştırılmış (şifresiz – ortak oda verisi zaten herkese açık)
 *   BBT1.E.<iv>.<şifreli gövde> Özel oda: oda anahtarıyla AES-256-GCM şifreli; yalnızca aynı odaya
 *                               girmiş cihaz çözebilir. Mesajlaşma uygulamasında kalsa bile okunamaz.
 * Gövde = qrcodec.encodeBlob (kısaltılmış anahtar + deflate + base64url).
 */
import { decodeBlob, encodeBlob } from './qrcodec.js';
import { decryptJSON, encryptJSON, importKey } from './crypto.js';
import { decodeMatch, isCompact } from './compactProtocol.js';
import { decodeTransfer, parsePart } from './qrcodec.js';

const b64u = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);

export async function makeTextCode(records, session) {
  const body = await encodeBlob(records);
  if (session.type !== 'private') return `BBT1.P.${body}`;
  const box = await encryptJSON(await importKey(session.key), body);
  return `BBT1.E.${b64u(box.iv)}.${b64u(box.ct)}`;
}

/**
 * Yapıştırılan metindeki TÜM tanınan blokları çözer: BBT1 kodları, kompakt maç QR metinleri (BZ2|…)
 * ve toplu QR parçaları (BB1|…). Böylece bir QR okuyucu uygulamasından kopyalanan metin de çalışır.
 */
export async function parseAnyText(text, session) {
  const out = [];
  const errors = [];
  for (const m of text.matchAll(/BBT1\.([PE])\.([A-Za-z0-9_\-.]+)/g)) {
    try {
      if (m[1] === 'P') out.push(...(await decodeBlob(m[2])));
      else {
        if (session.type !== 'private') throw new Error('Bu kod özel bir odaya ait – o odaya girip tekrar deneyin');
        const [iv, ct] = m[2].split('.');
        let body;
        try {
          body = await decryptJSON(await importKey(session.key), { iv: unb64u(iv), ct: unb64u(ct) });
        } catch {
          throw new Error('Şifre çözülemedi – kod başka bir özel odaya ait');
        }
        out.push(...(await decodeBlob(body)));
      }
    } catch (e) {
      errors.push(e.message);
    }
  }
  const lines = text.split(/\s*\n\s*|\s{2,}/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines.filter(isCompact)) {
    try {
      out.push(await decodeMatch(l));
    } catch (e) {
      errors.push(e.message);
    }
  }
  const parts = lines.map(parsePart).filter(Boolean);
  const byTid = parts.reduce((m, p) => ((m[p.tid] ||= []).push(p), m), {});
  for (const ps of Object.values(byTid)) {
    if (ps.length === ps[0].total) out.push(...(await decodeTransfer(ps)));
    else errors.push(`Toplu QR eksik parça (${ps.length}/${ps[0].total})`);
  }
  return { records: out, errors };
}
