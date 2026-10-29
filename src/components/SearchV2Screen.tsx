// شاشة البحث V2 — خلف المفتاح VITE_SEARCH_V2
// المصدر الوحيد: خدمة الأماكن المفتوحة في الخادم عبر POST (لا نص بحث ولا موقع راكب في سجلات Nginx)
// النتائج من المحافظة المختارة فقط، وتُعرض بالاسم ثم الفئة والحي والمسافة

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectGovernorateByCoords,
  fetchGovernorates,
  formatPlaceDistance,
  searchPlacesInGovernorate,
  MIN_QUERY_LENGTH,
  PLACES_ATTRIBUTION,
  PlacesQueryTooShortError,
  PlacesServiceUnavailableError,
  type GovernorateRef,
  type PlaceSearchResult,
} from '../lib/placesApi';
import { Spinner } from './ui';
import type { LngLat } from '../types';

const DEBOUNCE_MS = 350;

interface SearchV2ScreenProps {
  isDark: boolean;
  title: string;
  placeholder: string;
  /** موقع الراكب: يُكشف منه المحافظة وتُحسب عليه المسافات */
  proximity: LngLat;
  onClose: () => void;
  onSelect: (place: PlaceSearchResult) => void;
  onShowOnMap: (results: PlaceSearchResult[]) => void;
}

export default function SearchV2Screen({
  isDark,
  title,
  placeholder,
  proximity,
  onClose,
  onSelect,
  onShowOnMap,
}: SearchV2ScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorText, setErrorText] = useState('');

  const [gov, setGov] = useState<GovernorateRef | null>(null);
  const [isGovLoading, setIsGovLoading] = useState(true);
  const [govList, setGovList] = useState<GovernorateRef[]>([]);
  const [isGovPickerOpen, setIsGovPickerOpen] = useState(false);

  const debounceTimer = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // --- زر الرجوع في المتصفح يُغلق الشاشة (history) ---
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const poppedRef = useRef(false);

  useEffect(() => {
    window.history.pushState({ tawseelaSearchV2: Date.now() }, '');
    const onPop = () => {
      poppedRef.current = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // أُغلقت بـ ✕ أو باختيار نتيجة: نُزيل مدخل الـ history الذي أضفناه
      if (!poppedRef.current) window.history.back();
    };
  }, []);

  // --- كشف المحافظة تلقائياً من موقع الراكب ---
  useEffect(() => {
    const ctrl = new AbortController();
    setIsGovLoading(true);
    detectGovernorateByCoords(proximity, ctrl.signal)
      .then((detected) => setGov(detected))
      .catch(() => setGov(null))
      .finally(() => setIsGovLoading(false));
    return () => ctrl.abort();
  }, [proximity.lat, proximity.lng]);

  // --- تنفيذ البحث ---
  const runSearch = useCallback(
    async (rawQuery: string, govCode: string | null) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setIsSearching(true);
      setErrorText('');
      try {
        const res = await searchPlacesInGovernorate(rawQuery, proximity, govCode, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setResults(res.results);
        if (res.results.length === 0 && res.reason) setErrorText(res.reason);
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return;
        setResults([]);
        if (err instanceof PlacesQueryTooShortError) {
          setErrorText('');
        } else if (err instanceof PlacesServiceUnavailableError) {
          setErrorText('خدمة الأماكن غير مفعّلة في هذه البيئة.');
        } else {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            setErrorText('خدمة الأماكن غير مفعّلة في هذه البيئة.');
          } else if (status === 429) {
            setErrorText('بحث كثير بوقت قصير. انتظر لحظة ثم أعد المحاولة.');
          } else if (status === 400) {
            setErrorText('');
          } else {
            setErrorText('تعذّر الوصول إلى خدمة الأماكن. تحقّق من الاتصال.');
          }
        }
      } finally {
        if (!ctrl.signal.aborted) setIsSearching(false);
      }
    },
    [proximity.lat, proximity.lng],
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);

    if (value.trim().length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setResults([]);
      setIsSearching(false);
      setErrorText('');
      return;
    }

    setIsSearching(true);
    const govCode = gov?.code ?? null;
    debounceTimer.current = window.setTimeout(() => {
      void runSearch(value, govCode);
    }, DEBOUNCE_MS);
  }

  function handlePickGovernorate(next: GovernorateRef) {
    setGov(next);
    setIsGovPickerOpen(false);
    if (query.trim().length >= MIN_QUERY_LENGTH) {
      void runSearch(query, next.code);
    }
  }

  function openGovPicker() {
    setIsGovPickerOpen(true);
    if (govList.length === 0) {
      fetchGovernorates()
        .then(setGovList)
        .catch(() => setGovList([]));
    }
  }

  useEffect(() => {
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const govLabel = isGovLoading
    ? 'جاري التحديد...'
    : gov
      ? gov.name_ar
      : 'اختر المحافظة';

  return (
    // z-[130] أعلى من ترويسة الصفحة z-[100] حتى لا تغطي الأيقونات العنوان وزر الخروج
    <div
      className={`fixed inset-0 md:max-w-md md:mx-auto z-[130] flex flex-col ${
        isDark ? 'bg-[#0D131F] text-white' : 'bg-slate-50 text-slate-900'
      }`}
      dir="rtl"
    >
      {/* الترويسة: العنوان وزر الخروج */}
      <div
        className={`flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200 bg-white'
        }`}
      >
        <h2 className="text-[18px] font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-800'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
          }`}
          aria-label="إغلاق البحث"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* شريط المحافظة ومربع البحث */}
      <div className="px-4 py-3 space-y-2.5">
        <button
          type="button"
          onClick={openGovPicker}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition cursor-pointer ${
            isDark
              ? 'bg-[#161C28] border-amber-500/30 text-amber-300 hover:border-amber-400'
              : 'bg-white border-slate-200 text-amber-700 hover:border-amber-400'
          }`}
        >
          <span>محافظتك: {govLabel}</span>
          <span className="flex items-center gap-1 text-[11.5px] font-semibold opacity-80">
            تغيير
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        <div
          className={`flex items-center rounded-xl border px-3 py-2.5 transition-all focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 ${
            isDark ? 'bg-[#0B101B] border-amber-500/30' : 'bg-white border-slate-300 shadow-sm'
          }`}
        >
          <div className="mr-1 text-amber-500">
            <svg
              className="h-4.5 w-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            autoFocus
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 bg-transparent text-[14px] font-medium outline-none placeholder-slate-400 font-map-search ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => handleQueryChange('')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              aria-label="تفريغ نص البحث"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {results.length > 0 && (
          <button
            type="button"
            onClick={() => onShowOnMap(results)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition cursor-pointer active:scale-[0.99] ${
              isDark
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:border-amber-400'
                : 'bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-500'
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            عرض على الخريطة ({results.length})
          </button>
        )}
      </div>

      {/* النتائج */}
      <div className={`flex-1 overflow-y-auto px-4 pb-3 ${isDark ? 'bg-[#080E1A]' : 'bg-white'}`}>
        {isSearching && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Spinner className="h-5 w-5 ml-2 text-amber-500" />
            <span className="text-xs font-semibold">جاري البحث...</span>
          </div>
        )}

        {!isSearching && errorText.length > 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] font-bold text-amber-500">{errorText}</p>
          </div>
        )}

        {!isSearching && !errorText && results.length > 0 && (
          <div className="space-y-1.5 pt-3">
            <p className={`mb-2 text-[12px] font-bold px-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              النتائج ({results.length}) — {gov?.name_ar ?? ''}
            </p>
            {results.map((place, idx) => (
              <button
                key={place.id}
                type="button"
                onClick={() => onSelect(place)}
                className={`group flex w-full items-center gap-3 p-3 rounded-xl border text-right transition-all duration-200 cursor-pointer ${
                  isDark
                    ? 'border-slate-800 bg-[#0B101B] hover:border-amber-500/50'
                    : 'border-slate-200 bg-slate-50 hover:border-amber-500 hover:bg-amber-50/30'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-black ${
                    isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 font-map-search">
                  <span
                    className={`block text-[14.5px] font-bold truncate ${
                      isDark ? 'text-slate-200 group-hover:text-amber-300' : 'text-slate-900'
                    }`}
                  >
                    {place.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-[12px] font-medium truncate ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {[place.category, place.area_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[12px] font-bold tabular-nums ${
                    isDark ? 'text-amber-400' : 'text-amber-700'
                  }`}
                >
                  {formatPlaceDistance(place.distance_m)}
                </span>
              </button>
            ))}
          </div>
        )}

        {!isSearching && !errorText && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className={`text-[15px] font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              لا نتائج في {gov?.name_ar ?? 'هذه المحافظة'}
            </p>
            <p className="text-[12.5px] text-slate-400 mt-1 max-w-xs">
              جرّب اسم المعلم أو الحي أو الشارع، أو غيّر المحافظة من الشريط أعلاه.
            </p>
          </div>
        )}

        {!isSearching && !errorText && query.trim().length < MIN_QUERY_LENGTH && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-[13px] font-semibold text-slate-400">
              اكتب حرفين على الأقل للبحث في أماكن {gov?.name_ar ?? 'محافظتك'}
            </p>
          </div>
        )}
      </div>

      {/* الإشارة إلى مصادر البيانات المفتوحة (إلزامية حسب الرخص) */}
      <div
        className={`px-4 py-2 text-[10.5px] leading-relaxed text-center border-t ${
          isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
        }`}
      >
        {PLACES_ATTRIBUTION}
      </div>

      {/* قائمة اختيار المحافظة */}
      {isGovPickerOpen && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/60 backdrop-blur-xs" dir="rtl">
          <button
            type="button"
            className="flex-1 cursor-default"
            onClick={() => setIsGovPickerOpen(false)}
            aria-label="إغلاق قائمة المحافظات"
          />
          <div
            className={`max-h-[70%] overflow-y-auto rounded-t-2xl border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 ${
              isDark ? 'bg-[#0D131F] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <p className="mb-2 text-[13px] font-bold">اختر المحافظة</p>
            {govList.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Spinner className="h-4 w-4 ml-2 text-amber-500" />
                <span className="text-xs font-semibold">جاري تحميل المحافظات...</span>
              </div>
            ) : (
              <div className="space-y-1">
                {govList.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => handlePickGovernorate(item)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-right text-[13.5px] font-bold transition cursor-pointer ${
                      item.code === gov?.code
                        ? isDark
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                          : 'border-amber-400 bg-amber-50 text-amber-800'
                        : isDark
                          ? 'border-slate-800 bg-[#0B101B] text-slate-200 hover:border-amber-500/40'
                          : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-amber-400'
                    }`}
                  >
                    <span>{item.name_ar}</span>
                    {item.code === gov?.code && <span className="text-[11px]">الحالية</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
