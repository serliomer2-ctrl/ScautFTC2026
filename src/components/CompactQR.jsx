import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { encodeMatch } from '../lib/compactProtocol.js';

/** Tek maç kaydını kompakt (BZ2) QR olarak gösterir – her temada beyaz zemin */
export function MatchQR({ record, size = 'max-w-xs' }) {
  const [src, setSrc] = useState('');
  const [len, setLen] = useState(0);
  useEffect(() => {
    let alive = true;
    const text = encodeMatch(record);
    setLen(text.length);
    // Kısa veri → orta seviye hata düzeltme (loş salonda / çizik ekranda daha dayanıklı)
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 4, width: 640 }).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [record]);
  return (
    <div className={`mx-auto w-full ${size}`}>
      <div className="rounded-2xl bg-white p-1">
        {src && <img src={src} alt={`#${record.match.teamNumber} maç ${record.match.matchNumber} QR`} className="w-full" style={{ imageRendering: 'pixelated' }} />}
      </div>
      <p className="mt-1 text-center text-[11px] text-muted">{len} karakter · kompakt QR</p>
    </div>
  );
}

/**
 * Scouter: kendi maçlarını tek tek QR olarak Master cihaza okutur.
 * Bekleyen (henüz buluta gitmemiş) kayıtlar önce gelir.
 */
export default function ScouterQRSend({ records, scouter }) {
  const mine = records
    .filter((r) => !scouter || r.scouter === scouter)
    .sort((a, b) => Number(!!b._pending) - Number(!!a._pending) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const [i, setI] = useState(0);
  const cur = mine[Math.min(i, mine.length - 1)];
  const pending = mine.filter((r) => r._pending).length;

  if (!mine.length) return <section className="card text-center text-muted">Henüz kaydettiğiniz maç yok.</section>;
  return (
    <section className="card grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📤 Master'a Okut</h2>
        <span className="text-sm text-muted">{pending ? `${pending} bekleyen` : 'hepsi bulutta'}</span>
      </div>
      <div className={`rounded-xl border-l-4 bg-raised p-3 ${cur.match.alliance === 'blue' ? 'border-blue-alliance' : 'border-red-alliance'}`}>
        <div className="text-xl font-extrabold">#{cur.match.teamNumber} · {cur.match.matchNumber}</div>
        <div className="text-xs text-muted">{cur._pending ? '⏳ senkronize bekliyor' : '☁️ bulutta'} · {cur.scouter}</div>
      </div>
      <MatchQR record={cur} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button className="btn-ghost" disabled={i <= 0} onClick={() => setI(i - 1)}>◀ Önceki</button>
        <span className="text-sm tabular-nums">{Math.min(i, mine.length - 1) + 1}/{mine.length}</span>
        <button className="btn-primary" disabled={i >= mine.length - 1} onClick={() => setI(i + 1)}>Sonraki ▶</button>
      </div>
    </section>
  );
}
