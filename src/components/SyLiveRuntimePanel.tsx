import React, { useState } from 'react';

interface LayerGroup {
  title: string;
  items: { id: string; label: string; active: boolean; icon?: string }[];
}

export const SyLiveRuntimePanel: React.FC = () => {
  const [layers, setLayers] = useState<LayerGroup[]>([
    {
      title: 'HARİTA TEMEL KATMANLARI',
      items: [
        { id: 'topo', label: 'Topografya & Yükseklik', active: true },
        { id: 'geology', label: 'Jeolojik Katmanlar & Faylar', active: true },
        { id: 'hydro', label: 'Hidrografya (Su/Akarsu)', active: false },
        { id: 'flora', label: 'Bitki Örtüsü / NDVI', active: false },
        { id: 'satellite', label: 'Yüksek Çözünürlüklü Uydu', active: true },
        { id: 'transport', label: 'Ulaşım & Yol Ağları', active: false },
      ]
    },
    {
      title: 'JEOLOJİ & YERALTI ANALİZİ',
      items: [
        { id: 'gpr', label: 'GPR (Yeraltı Radarı)', active: false },
        { id: 'ert', label: 'Elektrik Direnç (ERT)', active: false },
        { id: 'mag', label: 'Manyetik & Gravite Anomalisi', active: true },
        { id: 'seismic', label: 'Sismik Hareketlilik (USGS/AFAD)', active: true },
        { id: 'thermal', label: 'Termal & Spektral Anomali (NASA)', active: true },
        { id: 'cavity', label: 'Boşluk & Yeraltı Yapıları', active: false },
      ]
    },
    {
      title: 'TARİH & ARKEOLOJİ KATMANI',
      items: [
        { id: 'settlements', label: 'Antik Yerleşimler & Höyükler', active: true },
        { id: 'tumulus', label: 'Tümülüs & Kaya Mezarları', active: false },
        { id: 'roads', label: 'Tarihi Yol Ağları', active: false },
        { id: 'excavation', label: 'Kazı Alanları & Buluntular', active: false },
      ]
    },
    {
      title: 'CİHAZ VE SENSÖR EKOSİSTEMİ',
      items: [
        { id: 'gps_rtk', label: 'GPS / RTK Santimetre Hassasiyet', active: true },
        { id: 'drone', label: 'Mikro Drone Telemetrisi', active: false },
        { id: 'snake_cam', label: 'Yılan Kamera (Wi-Fi/BT)', active: false },
        { id: 'space_weather', label: 'Uzay Havası & Jeomanyetik Kp', active: true },
      ]
    }
  ]);

  const [edsAlerts] = useState([
    { id: '1', level: 'KRİTİK', text: 'Sismik Fay Hattı Yakınlığı: 12 km (Derinlik 8.4 km)', time: '17:35' },
    { id: '2', level: 'BİLGİ', text: 'NASA FIRMS Termal Isı Taraması Aktif', time: '17:30' },
    { id: '3', level: 'UYARI', text: 'Jeomanyetik Kp İndeksi: 2.3 (Sakin/Kararlı)', time: '17:20' }
  ]);

  const toggleLayer = (groupIndex: number, itemIndex: number) => {
    const updated = [...layers];
    updated[groupIndex].items[itemIndex].active = !updated[groupIndex].items[itemIndex].active;
    setLayers(updated);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-slate-100 p-3 space-y-4 overflow-y-auto text-xs font-sans">
      {/* Sistem Durumu */}
      <div className="border border-emerald-500/40 bg-emerald-950/20 p-2.5 rounded">
        <div className="flex items-center justify-between font-bold text-emerald-400">
          <span>● SİSTEM DURUMU: AKTİF</span>
          <span className="text-[10px] bg-emerald-900/60 px-1.5 py-0.5 rounded">CANLI AKIŞ</span>
        </div>
        <p className="text-[11px] text-slate-300 mt-1">
          Göksel OSINT, Sismoloji ve Sensör Hub devrede.
        </p>
      </div>

      {/* Dinamik Katman Ağacı */}
      <div className="space-y-3">
        {layers.map((group, gIdx) => (
          <div key={gIdx} className="bg-slate-800/60 border border-slate-700/60 rounded p-2">
            <div className="font-bold text-sky-400 mb-2 tracking-wider text-[11px] border-b border-slate-700/40 pb-1">
              {group.title}
            </div>
            <div className="space-y-1.5">
              {group.items.map((item, iIdx) => (
                <label key={item.id} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-700/30 p-1 rounded transition">
                  <input
                    type="checkbox"
                    checked={item.active}
                    onChange={() => toggleLayer(gIdx, iIdx)}
                    className="accent-sky-500 rounded cursor-pointer"
                  />
                  <span className={item.active ? 'text-slate-100 font-medium' : 'text-slate-400'}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* EDS Bildirimleri */}
      <div className="bg-red-950/20 border border-red-500/40 rounded p-2.5">
        <div className="font-bold text-red-400 mb-2 flex items-center justify-between text-[11px]">
          <span>EDS BİLDİRİM MERKEZİ</span>
          <span className="text-[9px] bg-red-900/60 text-red-200 px-1 rounded">3 CANLI UYARI</span>
        </div>
        <div className="space-y-1.5">
          {edsAlerts.map(alert => (
            <div key={alert.id} className="bg-slate-800/80 p-1.5 rounded border border-slate-700 text-[11px]">
              <div className="flex justify-between items-center">
                <span className={`font-bold text-[10px] ${alert.level === 'KRİTİK' ? 'text-red-400' : alert.level === 'UYARI' ? 'text-amber-400' : 'text-sky-400'}`}>
                  [{alert.level}]
                </span>
                <span className="text-[9px] text-slate-400">{alert.time}</span>
              </div>
              <div className="text-slate-200 mt-0.5">{alert.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};