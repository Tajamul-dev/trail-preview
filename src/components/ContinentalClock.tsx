import React, { useState, useEffect, useRef, useMemo } from 'react';

interface ZoneConfig {
  city: string;
  flag: string;
  tz: string;
  code: string;
}

const BIZ_START = 9;
const BIZ_END = 18;
const STORE_KEY = 'gfi_world_clock_v2';

// Every US timezone — always visible
const USA_ZONES: ZoneConfig[] = [
  { city: 'New York (ET)', flag: '🇺🇸', tz: 'America/New_York', code: 'ET' },
  { city: 'Chicago (CT)', flag: '🇺🇸', tz: 'America/Chicago', code: 'CT' },
  { city: 'Denver (MT)', flag: '🇺🇸', tz: 'America/Denver', code: 'MT' },
  { city: 'Phoenix (MST)', flag: '🇺🇸', tz: 'America/Phoenix', code: 'MST' },
  { city: 'Los Angeles (PT)', flag: '🇺🇸', tz: 'America/Los_Angeles', code: 'PT' },
  { city: 'Anchorage (AKT)', flag: '🇺🇸', tz: 'America/Anchorage', code: 'AKT' },
  { city: 'Honolulu (HT)', flag: '🇺🇸', tz: 'Pacific/Honolulu', code: 'HT' },
];

const DEFAULT_WORLD: ZoneConfig[] = [
  { city: 'London', flag: '🇬🇧', tz: 'Europe/London', code: 'GMT' },
  { city: 'Dubai', flag: '🇦🇪', tz: 'Asia/Dubai', code: 'GST' },
  { city: 'Mumbai', flag: '🇮🇳', tz: 'Asia/Kolkata', code: 'IST' },
  { city: 'Singapore', flag: '🇸🇬', tz: 'Asia/Singapore', code: 'SGT' },
];

// World cities available through search
const WORLD_CITIES: ZoneConfig[] = [
  { city: 'London', flag: '🇬🇧', tz: 'Europe/London', code: 'GMT' },
  { city: 'Manchester', flag: '🇬🇧', tz: 'Europe/London', code: 'GMT' },
  { city: 'Dublin', flag: '🇮🇪', tz: 'Europe/Dublin', code: 'GMT' },
  { city: 'Lisbon', flag: '🇵🇹', tz: 'Europe/Lisbon', code: 'WET' },
  { city: 'Paris', flag: '🇫🇷', tz: 'Europe/Paris', code: 'CET' },
  { city: 'Frankfurt', flag: '🇩🇪', tz: 'Europe/Berlin', code: 'CET' },
  { city: 'Berlin', flag: '🇩🇪', tz: 'Europe/Berlin', code: 'CET' },
  { city: 'Amsterdam', flag: '🇳🇱', tz: 'Europe/Amsterdam', code: 'CET' },
  { city: 'Brussels', flag: '🇧🇪', tz: 'Europe/Brussels', code: 'CET' },
  { city: 'Zurich', flag: '🇨🇭', tz: 'Europe/Zurich', code: 'CET' },
  { city: 'Vienna', flag: '🇦🇹', tz: 'Europe/Vienna', code: 'CET' },
  { city: 'Milan', flag: '🇮🇹', tz: 'Europe/Rome', code: 'CET' },
  { city: 'Rome', flag: '🇮🇹', tz: 'Europe/Rome', code: 'CET' },
  { city: 'Madrid', flag: '🇪🇸', tz: 'Europe/Madrid', code: 'CET' },
  { city: 'Stockholm', flag: '🇸🇪', tz: 'Europe/Stockholm', code: 'CET' },
  { city: 'Copenhagen', flag: '🇩🇰', tz: 'Europe/Copenhagen', code: 'CET' },
  { city: 'Warsaw', flag: '🇵🇱', tz: 'Europe/Warsaw', code: 'CET' },
  { city: 'Athens', flag: '🇬🇷', tz: 'Europe/Athens', code: 'EET' },
  { city: 'Istanbul', flag: '🇹🇷', tz: 'Europe/Istanbul', code: 'TRT' },
  { city: 'Moscow', flag: '🇷🇺', tz: 'Europe/Moscow', code: 'MSK' },
  { city: 'Cairo', flag: '🇪🇬', tz: 'Africa/Cairo', code: 'EET' },
  { city: 'Tel Aviv', flag: '🇮🇱', tz: 'Asia/Jerusalem', code: 'IST' },
  { city: 'Dubai', flag: '🇦🇪', tz: 'Asia/Dubai', code: 'GST' },
  { city: 'Doha', flag: '🇶🇦', tz: 'Asia/Qatar', code: 'AST' },
  { city: 'Riyadh', flag: '🇸🇦', tz: 'Asia/Riyadh', code: 'AST' },
  { city: 'Jeddah', flag: '🇸🇦', tz: 'Asia/Riyadh', code: 'AST' },
  { city: 'Karachi', flag: '🇵🇰', tz: 'Asia/Karachi', code: 'PKT' },
  { city: 'Mumbai', flag: '🇮🇳', tz: 'Asia/Kolkata', code: 'IST' },
  { city: 'Delhi', flag: '🇮🇳', tz: 'Asia/Kolkata', code: 'IST' },
  { city: 'Bengaluru', flag: '🇮🇳', tz: 'Asia/Kolkata', code: 'IST' },
  { city: 'Colombo', flag: '🇱🇰', tz: 'Asia/Colombo', code: '+0530' },
  { city: 'Dhaka', flag: '🇧🇩', tz: 'Asia/Dhaka', code: 'BST' },
  { city: 'Bangkok', flag: '🇹🇭', tz: 'Asia/Bangkok', code: 'ICT' },
  { city: 'Jakarta', flag: '🇮🇩', tz: 'Asia/Jakarta', code: 'WIB' },
  { city: 'Singapore', flag: '🇸🇬', tz: 'Asia/Singapore', code: 'SGT' },
  { city: 'Kuala Lumpur', flag: '🇲🇾', tz: 'Asia/Kuala_Lumpur', code: 'MYT' },
  { city: 'Hong Kong', flag: '🇭🇰', tz: 'Asia/Hong_Kong', code: 'HKT' },
  { city: 'Shanghai', flag: '🇨🇳', tz: 'Asia/Shanghai', code: 'CST' },
  { city: 'Manila', flag: '🇵🇭', tz: 'Asia/Manila', code: 'PHT' },
  { city: 'Tokyo', flag: '🇯🇵', tz: 'Asia/Tokyo', code: 'JST' },
  { city: 'Seoul', flag: '🇰🇷', tz: 'Asia/Seoul', code: 'KST' },
  { city: 'Sydney', flag: '🇦🇺', tz: 'Australia/Sydney', code: 'AEST' },
  { city: 'Melbourne', flag: '🇦🇺', tz: 'Australia/Melbourne', code: 'AEST' },
  { city: 'Auckland', flag: '🇳🇿', tz: 'Pacific/Auckland', code: 'NZST' },
  { city: 'Johannesburg', flag: '🇿🇦', tz: 'Africa/Johannesburg', code: 'SAST' },
  { city: 'Lagos', flag: '🇳🇬', tz: 'Africa/Lagos', code: 'WAT' },
  { city: 'Nairobi', flag: '🇰🇪', tz: 'Africa/Nairobi', code: 'EAT' },
  { city: 'Toronto', flag: '🇨🇦', tz: 'America/Toronto', code: 'ET' },
  { city: 'Vancouver', flag: '🇨🇦', tz: 'America/Vancouver', code: 'PT' },
  { city: 'Mexico City', flag: '🇲🇽', tz: 'America/Mexico_City', code: 'CT' },
  { city: 'São Paulo', flag: '🇧🇷', tz: 'America/Sao_Paulo', code: 'BRT' },
  { city: 'Buenos Aires', flag: '🇦🇷', tz: 'America/Argentina/Buenos_Aires', code: 'ART' },
];

function getZoneParts(tz: string, now: Date) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const map: Record<string, string> = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const hour24 = parseInt(map.hour || '0', 10) % 24;
    const minute = map.minute || '00';
    const second = map.second || '00';
    let h12 = hour24 % 12;
    if (h12 === 0) h12 = 12;
    const offFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const offMatch = offFmt.formatToParts(now).find(p => p.type === 'timeZoneName');
    return {
      hour24,
      minute,
      second,
      h12: String(h12).padStart(2, '0'),
      ampm: hour24 >= 12 ? 'PM' : 'AM',
      offset: (offMatch?.value || '').replace('GMT', 'UTC'),
      isBusiness: hour24 >= BIZ_START && hour24 < BIZ_END,
    };
  } catch {
    return { hour24: 12, minute: '00', second: '00', h12: '12', ampm: 'PM', offset: 'UTC', isBusiness: true };
  }
}

const ClockCard: React.FC<{
  zone: ZoneConfig;
  now: Date;
  onRemove?: () => void;
}> = ({ zone, now, onRemove }) => {
  const info = getZoneParts(zone.tz, now);
  return (
    <div
      className={`relative flex flex-col justify-between px-2.5 py-1.5 rounded-lg border transition-colors group ${
        info.isBusiness
          ? 'bg-emerald-50/70 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800'
          : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
        <span className="flex items-center gap-1 min-w-0">
          <span>{zone.flag}</span>
          <span className="truncate">{zone.city}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${info.isBusiness ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            title={info.isBusiness ? 'Office Open (9 AM - 6 PM)' : 'Office Closed'}
          />
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove city"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500 cursor-pointer font-black text-[11px] leading-none px-0.5"
            >
              ×
            </button>
          )}
        </span>
      </div>
      <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">
        {info.h12}:{info.minute}
        <span className="text-[10px] font-normal text-slate-500 ml-0.5">:{info.second} {info.ampm}</span>
      </div>
      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex justify-between mt-0.5">
        <span title={zone.tz}>{info.offset}</span>
        <span className={info.isBusiness ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''}>
          {info.isBusiness ? 'Open' : 'Off-hours'}
        </span>
      </div>
    </div>
  );
};

export const ContinentalClock: React.FC = () => {
  const [now, setNow] = useState(new Date());
  const [worldZones, setWorldZones] = useState<ZoneConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return DEFAULT_WORLD;
  });
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(worldZones)); } catch {}
  }, [worldZones]);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  const addZone = (z: ZoneConfig) => {
    setWorldZones(prev =>
      prev.some(x => x.tz === z.tz && x.city === z.city) ? prev : [...prev, z]
    );
    setSearch('');
    setSearchOpen(false);
  };

  const removeZone = (z: ZoneConfig) =>
    setWorldZones(prev => (prev.length > 1 ? prev.filter(x => !(x.tz === z.tz && x.city === z.city)) : prev));

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? WORLD_CITIES.filter(
          z => z.city.toLowerCase().includes(q) || z.tz.toLowerCase().includes(q) || z.code.toLowerCase().includes(q)
        )
      : WORLD_CITIES;
    return base
      .filter(z => !worldZones.some(x => x.tz === z.tz && x.city === z.city))
      .slice(0, 8);
  }, [search, worldZones]);

  const usaLive = USA_ZONES.map(z => ({ z, info: getZoneParts(z.tz, now) }));
  const worldLive = worldZones.map(z => ({ z, info: getZoneParts(z.tz, now) }));
  const usaOpenCount = usaLive.filter(x => x.info.isBusiness).length;

  return (
    <div className="p-2 space-y-2.5 bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
      {/* USA — every timezone */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="flex items-center gap-1.5 font-bold tracking-wider text-[10px] uppercase text-slate-500 dark:text-slate-400">
            🇺🇸 USA — ALL TIMEZONES
            <span className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold border ${usaOpenCount > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
              {usaOpenCount}/7 Offices Open
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {usaLive.map(({ z, info }, idx) => (
            <ClockCard key={z.tz + idx} zone={z} now={now} />
          ))}
        </div>
      </div>

      {/* World — searchable */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <span className="flex items-center gap-1.5 font-bold tracking-wider text-[10px] uppercase text-slate-500 dark:text-slate-400">
            🌍 WORLD — {worldLive.length} Cities
          </span>
          <div ref={searchRef} className="relative">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="🔍 Search any city / timezone…"
              className="w-56 px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            {searchOpen && suggestions.length > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSearchOpen(false)} />
                <div className="absolute right-0 z-40 mt-1 w-64 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1">
                  {suggestions.map(z => {
                    const pi = getZoneParts(z.tz, now);
                    return (
                      <button
                        key={z.city + z.tz}
                        type="button"
                        onClick={() => addZone(z)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-slate-800 cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                          <span>{z.flag}</span> {z.city}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {pi.h12}:{pi.minute} {pi.ampm} · {pi.offset}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
          {worldLive.map(({ z, info }) => (
            <ClockCard key={z.city + z.tz} zone={z} now={now} onRemove={() => removeZone(z)} />
          ))}
        </div>
      </div>
    </div>
  );
};
