import React, { useEffect, useRef, useState } from 'react';
import { runSyKasifSwarm } from './syAgentSwarm';

export interface AnomaliTespit {
  id: string;
  ad: string;
  tur: 'HEYKEL' | 'YAZIT' | 'YAPI' | 'SERAMIK' | 'BOSLUK' | 'BOTANIK' | 'MINERAL' | 'BELIRSIZ';
  donem: string;
  guvenSkoru: number | null;
  koordinat: string;
  katman: string;
  aciklama: string;
  sifaliTarif?: string;
  kutu?: { x: number; y: number; w: number; h: number };
  taktikYonlendirme: string;
  etiketRengi: string;
  sealHash: string;
}

export interface YuklenenMedya {
  id: string;
  url: string;
  tur: 'IMAGE' | 'VIDEO';
  ad: string;
  analizDurumu: 'BEKLIYOR' | 'ANALIZ_EDILIYOR' | 'TAMAMLANDI' | 'HATA';
  analizHatasi?: string;
  tespitler: AnomaliTespit[];
  seciliTespitIndex: number;
}

// Enum değerleri kod içinde ASCII olarak tutuluyor (BELIRSIZ, BOSLUK, YAZIT...);
// bu eşleme yalnızca EKRANDA doğru Türkçe karakterlerle göstermek içindir.
const TUR_ETIKETLERI: Record<AnomaliTespit['tur'], string> = {
  HEYKEL: 'HEYKEL',
  YAZIT: 'YAZIT',
  YAPI: 'YAPI',
  SERAMIK: 'SERAMİK',
  BOSLUK: 'BOŞLUK',
  BOTANIK: 'BOTANİK',
  MINERAL: 'MİNERAL',
  BELIRSIZ: 'BELİRSİZ',
};

function turEtiketi(tur: AnomaliTespit['tur']): string {
  return TUR_ETIKETLERI[tur] || tur;
}

export const SyFrameVisionAnalyzer: React.FC = () => {
  const [medyaListesi, setMedyaListesi] = useState<YuklenenMedya[]>([]);
  const [aktifMedyaIndex, setAktifMedyaIndex] = useState<number>(0);
  const [linkInput, setLinkInput] = useState('');
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
    };
  }, []);

  // Yapay Zeka & Ajan Çapraz Analizini Tetikleme
  const medyayiAnalizEt = async (medyaItem: YuklenenMedya) => {
    try {
      const swarmSonuc = await runSyKasifSwarm(medyaItem.url);

      const yeniTespitler: AnomaliTespit[] = [
        {
          id: `ANO-${Date.now()}-1`,
          ad: 'GÖRSEL MODEL AÇIKLAMASI',
          tur: 'BELIRSIZ',
          donem: 'Görselden doğrulanmadı',
          guvenSkoru: null,
          koordinat: 'Sağlanmadı',
          katman: 'Cloudflare Workers AI vision çıktısı',
          aciklama: swarmSonuc.finalVerdict,
          taktikYonlendirme:
            swarmSonuc.isManMade === true
              ? 'Model insan müdahalesi olasılığından söz ediyor; uzman incelemesi olmadan kesin hüküm vermeyin.'
              : swarmSonuc.isManMade === false
                ? 'Model doğal oluşumdan söz ediyor; sonuç yalnızca görsel yoruma dayanır.'
                : 'İnsan yapımı/doğal ayrımı için model çıktısı yeterince açık değil.',
          etiketRengi: '#38bdf8',
          sealHash: swarmSonuc.sealHash,
        },
      ];

      setMedyaListesi((prev) =>
        prev.map((m) =>
          m.id === medyaItem.id
            ? { ...m, analizDurumu: 'TAMAMLANDI', tespitler: yeniTespitler, seciliTespitIndex: 0 }
            : m
        )
      );

      // Anlık sesli taktik raporu
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const ut = new SpeechSynthesisUtterance(
          `${medyaItem.ad} ajanlar tarafından incelendi.${yeniTespitler[0].taktikYonlendirme}`
        );
        ut.lang = 'tr-TR';
        window.speechSynthesis.speak(ut);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Medya analizi başarısız oldu.';
      setMedyaListesi((prev) =>
        prev.map((m) =>
          m.id === medyaItem.id
            ? {
                ...m,
                analizDurumu: 'HATA',
                analizHatasi: message,
                tespitler: [],
              }
            : m
        )
      );
    }
  };

  // ÇOKLU FOTO / VİDEO YÜKLEME VE ANLIK ANALİZE ALMA
  const handleMedyaYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const yeniMedyalar: YuklenenMedya[] = Array.from(e.target.files).map((file, i) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return {
        id: `MED-${Date.now()}-${i}`,
        url: url,
        tur: file.type.startsWith('video') ? 'VIDEO' : 'IMAGE',
        ad: file.name,
        analizDurumu: 'ANALIZ_EDILIYOR',
        tespitler: [],
        seciliTespitIndex: 0,
      };
    });

    const baslangicIndex = medyaListesi.length;
    setMedyaListesi((prev) => [...prev, ...yeniMedyalar]);
    setAktifMedyaIndex(baslangicIndex);
    e.target.value = '';

    // Her bir yüklenen medyayı sırayla ajan analizine gönder
    for (const medya of yeniMedyalar) {
      await medyayiAnalizEt(medya);
    }
  };

  // LİNK EKLEME VE ANLIK ANALİZE ALMA
  const handleLinkYukle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;

    let normalizedUrl: string;
    try {
      const parsed = new URL(linkInput.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Yalnızca http/https bağlantıları kabul edilir.');
      }
      normalizedUrl = parsed.toString();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Geçerli bir medya URL’si girin.');
      return;
    }

    const yeniLink: YuklenenMedya = {
      id: `LINK-${Date.now()}`,
      url: normalizedUrl,
      tur: linkInput.includes('mp4') || linkInput.includes('youtube') ? 'VIDEO' : 'IMAGE',
      ad: `Bağlantı #${medyaListesi.length + 1}`,
      analizDurumu: 'ANALIZ_EDILIYOR',
      tespitler: [],
      seciliTespitIndex: 0,
    };

    const yeniIndex = medyaListesi.length;
    setMedyaListesi((prev) => [...prev, yeniLink]);
    setAktifMedyaIndex(yeniIndex);
    setLinkInput('');

    await medyayiAnalizEt(yeniLink);
  };

  // Listeden bir medyayı kaldır
  const medyaSil = (id: string) => {
    setMedyaListesi((prev) => {
      const silinenIndex = prev.findIndex((m) => m.id === id);
      if (silinenIndex === -1) return prev;

      const hedef = prev[silinenIndex];
      if (hedef.url.startsWith('blob:')) {
        URL.revokeObjectURL(hedef.url);
        objectUrlsRef.current.delete(hedef.url);
      }

      const yeniListe = prev.filter((m) => m.id !== id);

      setAktifMedyaIndex((currentIndex) => {
        if (yeniListe.length === 0) return 0;
        if (silinenIndex < currentIndex) return currentIndex - 1;
        if (silinenIndex === currentIndex) return Math.max(0, currentIndex - 1);
        return currentIndex;
      });

      return yeniListe;
    });
  };

  const aktifMedya = medyaListesi[aktifMedyaIndex] || null;
  const aktifTespit =
    aktifMedya && aktifMedya.tespitler.length > 0
      ? aktifMedya.tespitler[aktifMedya.seciliTespitIndex]
      : null;

  return (
    <div
      style={{
        backgroundColor: '#050914',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '12px',
        padding: '16px',
        color: '#fff',
        boxShadow: '0 0 35px rgba(2, 132, 199, 0.2)',
        marginBottom: '20px',
      }}
    >
      {/* ÜST BAŞLIK VE YÜKLEME BUTONU */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: '10px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#38bdf8', letterSpacing: '0.08em' }}>
              SyFrame™
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: '#94a3b8',
                borderLeft: '1px solid #334155',
                paddingLeft: '8px',
              }}
            >
              ÇOKLU MEDYA & GÖRSEL MODEL ANALİZİ
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {medyaListesi.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 'bold' }}>
              {medyaListesi.length} Medya Listede
            </span>
          )}
          <label
            style={{
              padding: '7px 14px',
              backgroundColor: '#0284c7',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 'bold',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📁 Çoklu Fotoğraf / Video Seç
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleMedyaYukle}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* LİNK GİRİŞİ */}
      <form onSubmit={handleLinkYukle} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <input
          type="url"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          placeholder="CORS izinli doğrudan görsel/video bağlantısı (https://...)"
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: '#020617',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '0.82rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#f59e0b',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer',
            color: '#000',
            fontSize: '0.8rem',
          }}
        >
          Görsel Modele Gönder
        </button>
      </form>

      {/* YÜKLENEN MEDYALARIN GALERİ ŞERİDİ */}
      {medyaListesi.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '10px',
            marginBottom: '12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {medyaListesi.map((medya, idx) => (
            <div
              key={medya.id}
              onClick={() => setAktifMedyaIndex(idx)}
              style={{
                position: 'relative',
                width: '85px',
                height: '58px',
                flexShrink: 0,
                borderRadius: '6px',
                overflow: 'hidden',
                cursor: 'pointer',
                border: `2px solid ${aktifMedyaIndex === idx ? '#38bdf8' : 'rgba(255,255,255,0.2)'}`,
                boxShadow: aktifMedyaIndex === idx ? '0 0 10px #38bdf8' : 'none',
                backgroundColor: '#000',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  medyaSil(medya.id);
                }}
                title="Bu medyayı kaldır"
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'rgba(239,68,68,0.85)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 3,
                }}
              >
                ✕
              </button>
              {medya.tur === 'IMAGE' ? (
                <img
                  src={medya.url}
                  alt={medya.ad}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    fontSize: '1.2rem',
                    color: '#f59e0b',
                  }}
                >
                  🎥
                </div>
              )}
              {medya.analizDurumu === 'ANALIZ_EDILIYOR' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.6rem',
                    color: '#38bdf8',
                  }}
                >
                  Model İşliyor...
                </div>
              )}
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'rgba(0,0,0,0.75)',
                  fontSize: '0.55rem',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  padding: '1px',
                }}
              >
                #{idx + 1} {medya.ad}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ORTA BÖLÜM: SOL EKRAN (GÖRSEL / EDS) + SAĞ (AJAN TALİMATI) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr', gap: '16px', marginBottom: '16px' }}>
        {/* SOL EKRAN: GÖRSEL & DİNAMİK EDS ÇERÇEVESİ */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#000',
            borderRadius: '8px',
            overflow: 'hidden',
            minHeight: '360px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(56, 189, 248, 0.2)',
          }}
        >
          {aktifMedya ? (
            aktifMedya.tur === 'IMAGE' ? (
              <img
                src={aktifMedya.url}
                alt="Saha Görseli"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <video
                src={aktifMedya.url}
                controls
                autoPlay
                loop
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🎯</div>
              <div style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'bold' }}>
                Canlı Saha Kadrajı Bekleniyor
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                Fotoğraf/video yükleyin veya doğrudan medya URL’si girin. YouTube ve RTSP desteklenmez.
              </div>
            </div>
          )}

          {/* DİNAMİK EDS ÇERÇEVESİ */}
          {aktifTespit?.kutu && (
            <div
              style={{
                position: 'absolute',
                top: `${aktifTespit.kutu.y}%`,
                left: `${aktifTespit.kutu.x}%`,
                width: `${aktifTespit.kutu.w}%`,
                height: `${aktifTespit.kutu.h}%`,
                border: `2px solid ${aktifTespit.etiketRengi}`,
                boxShadow: `0 0 20px ${aktifTespit.etiketRengi}`,
                borderRadius: '6px',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -3,
                  left: -3,
                  width: 12,
                  height: 12,
                  borderTop: '3px solid #f59e0b',
                  borderLeft: '3px solid #f59e0b',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 12,
                  height: 12,
                  borderTop: '3px solid #f59e0b',
                  borderRight: '3px solid #f59e0b',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -3,
                  left: -3,
                  width: 12,
                  height: 12,
                  borderBottom: '3px solid #f59e0b',
                  borderLeft: '3px solid #f59e0b',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: -3,
                  right: -3,
                  width: 12,
                  height: 12,
                  borderBottom: '3px solid #f59e0b',
                  borderRight: '3px solid #f59e0b',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: -6,
                  top: '50%',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: aktifTespit.etiketRengi,
                  boxShadow: `0 0 10px ${aktifTespit.etiketRengi}`,
                }}
              />
            </div>
          )}
        </div>

        {/* SAĞDA: AJAN TALİMATI */}
        <div
          style={{
            backgroundColor: '#081020',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {aktifMedya && aktifTespit ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: '8px',
                  marginBottom: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#38bdf8' }}>
                    {aktifTespit.ad}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                    TÜR: {turEtiketi(aktifTespit.tur)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: '900', color: '#fbbf24' }}>
                    {aktifTespit.guvenSkoru === null ? 'PUAN YOK' : `%${aktifTespit.guvenSkoru}`}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b' }}>MODEL GÜVENİ</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', display: 'grid', gap: '6px', color: '#cbd5e1' }}>
                <div>
                  <strong>⏳ DÖNEM / TİP:</strong> {aktifTespit.donem}
                </div>
                <div>
                  <strong>📍 KOORDİNAT:</strong> {aktifTespit.koordinat}
                </div>
                <div>
                  <strong>🧱 KATMAN:</strong> {aktifTespit.katman}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: '2px', lineHeight: '1.4' }}>
                  {aktifTespit.aciklama}
                </div>

                {aktifTespit.sifaliTarif && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px',
                      backgroundColor: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid #22c55e',
                      borderRadius: '6px',
                      color: '#86efac',
                      fontSize: '0.74rem',
                    }}
                  >
                    {aktifTespit.sifaliTarif}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: '12px',
                  padding: '10px',
                  backgroundColor: '#1e1b4b',
                  border: '1px solid #818cf8',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  color: '#e0e7ff',
                }}
              >
                <strong style={{ color: '#a5b4fc', display: 'block', marginBottom: '4px' }}>
                  MODEL ÇIKTISI İÇİN UYARI:
                </strong>
                {aktifTespit.taktikYonlendirme}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem', margin: 'auto' }}>
              {aktifMedya?.analizDurumu === 'ANALIZ_EDILIYOR'
                ? 'Görsel model medyayı işliyor...'
                : aktifMedya?.analizDurumu === 'HATA'
                  ? `Hata: ${aktifMedya.analizHatasi || 'Analiz tamamlanamadı.'}`
                  : 'Analiz için medya seçin veya yükleyin.'}
            </div>
          )}

          <div
            style={{
              fontSize: '0.65rem',
              color: '#64748b',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '8px',
              marginTop: '10px',
            }}
          >
            {aktifTespit
              ? `ÇIKTI ÖZETİ: ${aktifTespit.sealHash} • HARİCİ KAYNAK TARAMASI YAPILMADI`
              : 'Henüz doğrulanabilir model çıktısı yok.'}
          </div>
        </div>
      </div>

      {/* ALT KISIM: ANOMALİ KARTLARI */}
      {aktifMedya && aktifMedya.tespitler.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
          {aktifMedya.tespitler.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => {
                setMedyaListesi((prev) =>
                  prev.map((m, i) => (i === aktifMedyaIndex ? { ...m, seciliTespitIndex: idx } : m))
                );
              }}
              style={{
                padding: '10px',
                backgroundColor:
                  aktifMedya.seciliTespitIndex === idx ? 'rgba(56, 189, 248, 0.15)' : '#070c18',
                border: `1px solid ${
                  aktifMedya.seciliTespitIndex === idx ? item.etiketRengi : 'rgba(255,255,255,0.08)'
                }`,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: item.etiketRengi }}>{item.ad}</div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '2px 0' }}>{turEtiketi(item.tur)}</div>
              <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 'bold' }}>
                {item.guvenSkoru === null ? 'Model güven puanı sağlamadı' : `Güven: %${item.guvenSkoru}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};