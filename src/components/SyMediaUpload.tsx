import React, { useEffect, useRef, useState } from 'react';
import { askKasifAI } from '../services/aiService';

interface YuklenenMedya {
  id: string;
  ad: string;
  tur: 'FOTO' | 'VIDEO';
  url: string;
}

const DOGRUDAN_MEDYA_UZANTILARI = /\.(jpe?g|png|gif|webp|mp4|webm|mov)(\?.*)?$/i;
const BILINEN_SAYFA_LINKLERI = /(instagram\.com|tiktok\.com|facebook\.com|twitter\.com|x\.com|youtube\.com|youtu\.be)/i;

export const SyMediaUpload: React.FC = () => {
  const [medyalar, setMedyalar] = useState<YuklenenMedya[]>([]);
  const [linkler, setLinkler] = useState<string[]>([]);
  const [yeniLink, setYeniLink] = useState('');
  const [linkUyarisi, setLinkUyarisi] = useState<string | null>(null);
  const [analizSonucu, setAnalizSonucu] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
    };
  }, []);

  // Çoklu Dosya Seçimi (Fotoğraf & Video)
  const handleDosyaSecimi = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const yeniEklenenler: YuklenenMedya[] = files.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrlsRef.current.add(url);
      return {
        id: crypto.randomUUID(),
        ad: file.name,
        tur: file.type.startsWith('video') ? 'VIDEO' : 'FOTO',
        url,
      };
    });

    setMedyalar((prev) => [...prev, ...yeniEklenenler]);
    // Aynı dosyayı tekrar seçebilmek için input'u sıfırla
    e.target.value = '';
  };

  // Yüklenen bir medyayı listeden kaldır
  const medyaSil = (id: string) => {
    setMedyalar((prev) => {
      const hedef = prev.find((m) => m.id === id);
      if (hedef) {
        URL.revokeObjectURL(hedef.url);
        objectUrlsRef.current.delete(hedef.url);
      }
      return prev.filter((m) => m.id !== id);
    });
  };

  // Eklenen bir linki listeden kaldır
  const linkSil = (index: number) => {
    setLinkler((prev) => prev.filter((_, i) => i !== index));
  };

  // Link Ekleme
  const handleLinkEkle = (e: React.FormEvent) => {
    e.preventDefault();
    const deger = yeniLink.trim();
    if (!deger) return;

    setLinkUyarisi(null);

    let ayrisan: URL;
    try {
      ayrisan = new URL(deger);
    } catch {
      setLinkUyarisi('Geçerli bir web bağlantısı girin (https:// ile başlamalı).');
      return;
    }
    if (!['http:', 'https:'].includes(ayrisan.protocol)) {
      setLinkUyarisi('Yalnızca http/https bağlantıları kabul edilir.');
      return;
    }

    if (BILINEN_SAYFA_LINKLERI.test(deger) && !DOGRUDAN_MEDYA_UZANTILARI.test(deger)) {
      setLinkUyarisi(
        'Bu bir sosyal medya SAYFA bağlantısı gibi görünüyor. Tarayıcı güvenlik kısıtlamaları (CORS) nedeniyle bu tür sayfaların arkasındaki video/görsel doğrudan çekilemez. Dosyayı indirip yukarıdan yükleyin veya doğrudan medya dosyası bağlantısı (.jpg, .mp4 vb. ile biten) kullanın.'
      );
      // Yine de listeye ekleyelim ama uyarıyı görünür tutalım — kullanıcı bilgilendirilmiş olarak devam edebilir.
    }

    setLinkler((prev) => [...prev, deger]);
    setYeniLink('');
  };

  // Tüm Kanıtları Toplu Analiz Et
  const topluAnalizBaslat = async () => {
    if (medyalar.length === 0 && linkler.length === 0) {
      alert('Lütfen analiz için en az bir fotoğraf, video veya link ekleyin.');
      return;
    }

    setYukleniyor(true);
    setAnalizSonucu('Medya envanteri AI tarafından özetleniyor...');

    const baglam = `
[YÜKLENEN KANIT VE MEDYALAR]
- Fotoğraf Sayısı: ${medyalar.filter((m) => m.tur === 'FOTO').length}
- Video Sayısı: ${medyalar.filter((m) => m.tur === 'VIDEO').length}
- Ekli Bağlantılar: ${linkler.join(', ') || 'Yok'}
- Dosya İsimleri: ${medyalar.map((m) => m.ad).join(', ')}
    `;

    try {
      const sonuc = await askKasifAI(
        'Yalnızca sağlanan dosya ve bağlantı listesini özetle. Medya içeriklerini görmediğini, doğrulama veya güven skoru üretemeyeceğini açıkça belirt.',
        baglam
      );
      setAnalizSonucu(sonuc);

      if ('speechSynthesis' in window) {
        const ut = new SpeechSynthesisUtterance('Medya envanter özeti hazırlandı.');
        ut.lang = 'tr-TR';
        window.speechSynthesis.speak(ut);
      }
    } catch (error) {
      setAnalizSonucu(
        error instanceof Error ? `AI hatası: ${error.message}` : 'AI servisine ulaşılamadı.'
      );
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#050b14',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '12px',
        padding: '20px',
        color: '#fff',
        boxShadow: '0 0 25px rgba(0,0,0,0.7)',
        marginTop: '16px',
      }}
    >
      {/* Başlık ve Rozet */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '1.1rem', letterSpacing: '0.1em' }}>
            SyFrame™ ÇOKLU MEDYA VE KANIT MERKEZİ
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            FOTOĞRAF • VİDEO • ÇAPRAZ BAĞLANTI ANALİZİ
          </span>
        </div>
        {/*
          Bu rozet YALNIZCA bir hatırlatmadır: bu ekranda hiçbir gerçek adli
          doğrulama (EXIF/ELA/ters görsel arama) çalışmaz. Bu yüzden bilinçli
          olarak UYARI (kırmızı/turuncu) rengiyle gösterilir — asla yeşil/
          "başarılı" izlenimi vermemelidir.
        */}
        <div
          style={{
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            fontWeight: 'bold',
          }}
        >
          ⚠ İÇERİK DOĞRULANMADI
        </div>
      </div>

      {/* Çoklu Foto & Video Yükleme Alanı */}
      <div
        style={{
          border: '2px dashed rgba(56, 189, 248, 0.3)',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#081120',
          marginBottom: '16px',
        }}
      >
        <input
          type="file"
          id="coklu-medya"
          multiple
          accept="image/*,video/*"
          onChange={handleDosyaSecimi}
          style={{ display: 'none' }}
        />
        <label
          htmlFor="coklu-medya"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#0284c7',
            color: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '0.85rem',
          }}
        >
          📷 / 🎥 Çoklu Fotoğraf ve Video Seç
        </label>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px', margin: '8px 0 0 0' }}>
          Birden fazla görsel veya saha videosunu aynı anda sürükleyip bırakabilir veya seçebilirsiniz.
        </p>
      </div>

      {/* Yüklenen Medyaların Önizleme Listesi */}
      {medyalar.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '10px',
            marginBottom: '16px',
          }}
        >
          {medyalar.map((m) => (
            <div
              key={m.id}
              style={{
                position: 'relative',
                minWidth: '100px',
                backgroundColor: '#0b1528',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '6px',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => medyaSil(m.id)}
                title="Bu medyayı kaldır"
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'rgba(239,68,68,0.85)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}
              >
                ✕
              </button>
              {m.tur === 'FOTO' ? (
                <img
                  src={m.url}
                  alt={m.ad}
                  style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '60px',
                    backgroundColor: '#0284c720',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                  }}
                >
                  🎥
                </div>
              )}
              <div
                style={{
                  fontSize: '0.65rem',
                  color: '#94a3b8',
                  marginTop: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.ad}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Ekleme */}
      <form onSubmit={handleLinkEkle} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <input
          type="url"
          value={yeniLink}
          onChange={(e) => setYeniLink(e.target.value)}
          placeholder="Analiz edilecek web / veri bağlantısını yapıştırın (https://...)"
          style={{
            flex: 1,
            padding: '10px',
            backgroundColor: '#081120',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '10px 16px',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          🔗 Link Ekle
        </button>
      </form>

      {linkUyarisi && (
        <div
          style={{
            marginBottom: '12px',
            padding: '9px',
            color: '#fde68a',
            backgroundColor: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            lineHeight: 1.5,
          }}
        >
          {linkUyarisi}
        </div>
      )}

      {/* Eklenen Linkler */}
      {linkler.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {linkler.map((l, idx) => (
            <span
              key={`${l}-${idx}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                backgroundColor: '#081120',
                border: '1px solid #0284c7',
                padding: '4px 6px 4px 10px',
                borderRadius: '4px',
                color: '#38bdf8',
              }}
            >
              🔗 {l}
              <button
                type="button"
                onClick={() => linkSil(idx)}
                title="Bu bağlantıyı kaldır"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Analiz Başlatma Butonu */}
      <button
        onClick={topluAnalizBaslat}
        disabled={yukleniyor}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: yukleniyor ? '#334155' : '#f59e0b',
          color: '#030712',
          border: 'none',
          borderRadius: '8px',
          fontWeight: '900',
          fontSize: '0.9rem',
          letterSpacing: '0.1em',
          cursor: yukleniyor ? 'not-allowed' : 'pointer',
          boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
        }}
      >
        {yukleniyor ? '⏳ ENVANTER ÖZETLENİYOR...' : 'MEDYA ENVANTERİNİ ÖZETLE'}
      </button>

      {/* Analiz Sonuç Paneli */}
      {analizSonucu && (
        <div
          style={{
            marginTop: '16px',
            padding: '14px',
            backgroundColor: '#081120',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '8px',
            color: '#f8fafc',
            fontSize: '0.88rem',
            lineHeight: '1.5',
          }}
        >
          <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: '6px', fontSize: '0.75rem' }}>
            📊 KÂŞİF MEDYA ENVANTER ÖZETİ:
          </div>
          {analizSonucu}
        </div>
      )}
    </div>
  );
};