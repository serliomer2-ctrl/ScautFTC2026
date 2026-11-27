import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SCORING } from '../config.js';
import { pairSynergy } from '../lib/synergy.js';
import { teamPenalty } from '../lib/penalties.js';
import { LineChart } from './Charts.jsx';
import { SynergyBadge } from './WhatIf.jsx';
import { f1 } from './TeamsView.jsx';

/**
 * Jüri / Mühendislik Portfolyosu Raporu
 *  - Yazdırılabilir yönetici özeti (window.print → "PDF olarak kaydet"; @media print açık tema)
 *  - Jüri Sunum Modu: aynı içerik, tablette tam ekran büyük slaytlar (◀ ▶ / kaydırma / klavye)
 * Tüm sayılar o anki oda verisinden hesaplanır.
 */
const SITE = 'scout.serli.net';
const TEAM = { name: 'Qubitrobotics', number: '37677' };

function picklistWeights(roomId) {
  try {
    return JSON.parse(localStorage.getItem(`bb2.picklist.${roomId}`))?.weights || { auto: 40, tele: 40, end: 20 };
  } catch {
    return { auto: 40, tele: 40, end: 20 };
  }
}

export default function Report({ stats, rawRecords, pitRecords, groups, scoring, myTeam, session }) {
  const [slide, setSlide] = useState(null);
  const S = { ...DEFAULT_SCORING, ...scoring };
  const me = stats.find((t) => t.num === String(myTeam));
  const rank = me ? [...stats].sort((a, b) => b.points - a.points).findIndex((t) => t.num === me.num) + 1 : null;
  const w = picklistWeights(session.roomId);
  const wSum = w.auto + w.tele + w.end || 1;
  const scouters = new Set(rawRecords.map((r) => r.scouter).filter(Boolean)).size;
  const verified = groups.filter((g) => g.status === 'verified').length;
  const anomalies = groups.length - verified;
  const photos = pitRecords.filter((p) => p.pit?.photo).length;
  const tele = rawRecords.filter((r) => r.timeline?.length).length;

  const partners = useMemo(() => {
    if (!me) return [];
    return stats
      .filter((t) => t.num !== me.num)
      .map((t) => {
        const syn = pairSynergy(me, t);
        const pen = teamPenalty(t, S);
        const adj = me.points + t.points - syn.penalty * Math.min(me.points, t.points) - pen.given;
        return { t, syn, adj, pen };
      })
      .sort((a, b) => b.adj - a.adj)
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, me, scoring]);

  const sections = [
    {
      id: 'ozet',
      title: 'Yönetici Özeti',
      body: (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Analiz edilen maç gözlemi', rawRecords.length],
            ['Veritabanındaki takım', new Set([...stats.map((t) => t.num), ...pitRecords.map((p) => String(p.team?.number))]).size],
            ['Gözlemci', scouters],
            ['Pit fotoğrafı', photos],
            ['Çift gözlem (doğrulanmış)', `${verified}/${groups.length}`],
            ['Açık uyuşmazlık', anomalies],
            ['Telemetrili maç', tele],
            ['Takımımızın sırası', rank ? `${rank}. / ${stats.length}` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-raised p-3">
              <div className="text-3xl font-black tabular-nums text-accent">{v}</div>
              <div className="text-xs font-semibold text-muted">{l}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'takim',
      title: `#${myTeam} Performans Gelişimi`,
      body: me ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Ort. puan <b className="text-xl">{f1(me.points)}</b></span>
            <span>Net katkı <b className="text-xl">{f1(teamPenalty(me, S).net)}</b></span>
            <span>Otonom {f1(me.autoPts)} · TeleOp {f1(me.telePts)} · Endgame {f1(me.endPts)}</span>
            <span>Eğilim {me.trend > 1 ? '📈 yükselişte' : me.trend < -1 ? '📉 düşüşte' : '➖ stabil'}</span>
          </div>
          <LineChart
            data={me.perMatch}
            series={[
              { key: 'total', label: 'Toplam', color: 'rgb(var(--accent))' },
              { key: 'auto', label: 'Otonom', color: 'rgb(var(--alliance-blue))' },
              { key: 'tele', label: 'TeleOp', color: 'rgb(var(--warn))' },
            ]}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">#{myTeam} için henüz maç gözlemi yok.</p>
      ),
    },
    {
      id: 'yontem',
      title: 'Veri & Algoritma Metodolojisi',
      body: (
        <ul className="grid gap-2 text-sm leading-relaxed">
          <li><b>Puan modeli:</b> Otonom Tip × {S.autoTip} + TeleOp Tip × {S.teleTip} + End Game Flower {S.endFlower} + başarılı otonom bonusu {S.autoBonus}.</li>
          <li><b>Ağırlıklı Picklist:</b> skor = %{Math.round((w.auto / wSum) * 100)} Otonom + %{Math.round((w.tele / wSum) * 100)} TeleOp + %{Math.round((w.end / wSum) * 100)} Endgame; her dönem alandaki en iyi takıma göre 0–100 normalize.</li>
          <li><b>Net Katkı:</b> brüt ortalama − rakibe kazandırılan ceza (Minor {S.minorFoul} p, Major {S.majorFoul} p). Maç başı ≥10 ceza puanı veya maçların ≥%30'unda Major → “Yüksek Ceza Riski”.</li>
          <li><b>Maç tahmini:</b> takım puanları normal dağılım (ortalama, std); ittifak = toplam; kazanma = Φ(farkı / birleşik std).</li>
          <li><b>Sinerji:</b> saha haritası skor bölgeleri ve otonom başlangıçları (180° aynalı) karşılaştırılır; aynı dar bölgede çalışan ikilinin beklenen puanı düşürülür.</li>
          <li><b>Veri doğrulama:</b> aynı maç + takımı izleyen gözlemciler; uyum = 0,7 × puan uyumu + 0,3 × kategorik uyum; ≥%90 doğrulanmış, altı yönetici kararına.</li>
          <li><b>Altyapı:</b> çevrimdışı öncelikli PWA, QR / metin kodu ile internetsiz aktarım, GitHub tabanlı çakışmasız senkronizasyon, özel odalarda AES-256 şifreleme.</li>
        </ul>
      ),
    },
    {
      id: 'ittifak',
      title: 'Veriyle Desteklenen En İyi İttifak Eşleşmeleri',
      body: partners.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1">#</th><th>Partner</th><th>Birlikte (net)</th><th>Sinerji</th><th>Ceza riski</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p, i) => (
              <tr key={p.t.num} className="border-t border-line">
                <td className="py-2 font-bold">{i + 1}</td>
                <td><b>#{p.t.num}</b> <span className="text-muted">{p.t.name}</span></td>
                <td className="text-lg font-black tabular-nums">{Math.round(p.adj)}</td>
                <td><SynergyBadge s={p.syn} /></td>
                <td>{p.pen.risk ? <b className="text-bad">Yüksek</b> : 'Düşük'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted">Takımımızın ve diğer takımların verisi gerekli.</p>
      ),
    },
  ];

  // Sunum modunda klavye ile gezinme
  useEffect(() => {
    if (slide == null) return undefined;
    const k = (e) => {
      if (e.key === 'ArrowRight') setSlide((s) => Math.min(sections.length, s + 1));
      if (e.key === 'ArrowLeft') setSlide((s) => Math.max(0, s - 1));
      if (e.key === 'Escape') setSlide(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [slide, sections.length]);

  const Header = ({ big }) => (
    <div className="flex items-center gap-3">
      <img src="./logo.webp" alt="Qubitrobotics logosu" className={big ? 'h-24 w-24 rounded-3xl' : 'h-14 w-14 rounded-2xl'} />
      <div>
        <div className={`font-black leading-tight ${big ? 'text-4xl' : 'text-2xl'}`}>{TEAM.name} #{TEAM.number}</div>
        <div className={big ? 'text-xl text-muted' : 'text-sm text-muted'}>Biobuzz Scout · Strateji & Scouting Raporu</div>
        <div className="text-xs text-muted">{session.roomName} · {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} · {SITE}</div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="no-print grid grid-cols-2 gap-2">
        <button className="btn-primary min-h-[52px]" onClick={() => window.print()}>🖨 Yazdır / PDF</button>
        <button className="btn-ghost min-h-[52px]" onClick={() => setSlide(0)}>🎤 Jüri Sunum Modu</button>
      </div>

      <div className="print-area grid gap-4 rounded-2xl bg-surface p-4">
        <Header />
        {sections.map((s) => (
          <section key={s.id} className="grid gap-2 rounded-2xl border border-line p-4">
            <h2 className="text-lg font-black">{s.title}</h2>
            {s.body}
          </section>
        ))}
        <p className="text-center text-xs text-muted">Bu rapor {SITE} tarafından turnuva verisinden otomatik üretilmiştir.</p>
      </div>

      {slide != null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Jüri sunumu">
          <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
            {slide === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <img src="./logo.webp" alt="Qubitrobotics logosu" className="h-48 w-48 rounded-[2.5rem] shadow-2xl" />
                <div className="text-5xl font-black">{TEAM.name} #{TEAM.number}</div>
                <div className="text-2xl text-muted">Veriye Dayalı Strateji: Biobuzz Scout</div>
                <div className="rounded-full bg-accent px-5 py-2 text-xl font-bold text-accent-fg">{SITE}</div>
              </div>
            ) : (
              <div className="mx-auto grid max-w-4xl gap-6 text-lg [&_.text-sm]:text-lg [&_.text-xs]:text-base">
                <Header big />
                <h2 className="text-4xl font-black text-accent">{sections[slide - 1].title}</h2>
                {sections[slide - 1].body}
              </div>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr_auto] items-center gap-2 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button className="btn-ghost min-h-[56px]" disabled={slide === 0} onClick={() => setSlide(slide - 1)}>◀ Geri</button>
            <span className="px-2 text-sm tabular-nums text-muted">{slide + 1}/{sections.length + 1}</span>
            <button className="btn-primary min-h-[56px]" disabled={slide === sections.length} onClick={() => setSlide(slide + 1)}>İleri ▶</button>
            <button className="btn-ghost min-h-[56px] px-4" onClick={() => setSlide(null)} aria-label="Sunumu kapat">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
