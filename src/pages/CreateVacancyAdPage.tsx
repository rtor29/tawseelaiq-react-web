// نشر إعلان رحلة شاغرة — بديل create_vacancy_ad_screen.dart

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints, http } from '../lib/api';
import { Button, Field, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

export default function CreateVacancyAdPage() {
  const navigate = useNavigate();
  const { show } = useToast();

  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [departureTime, setDepartureTime] = useState('08:00 ص');
  const [availableSeats, setAvailableSeats] = useState(3);
  const [price, setPrice] = useState('3000');
  const [notes, setNotes] = useState('تكييف مريح والإنطلاق بالموعد المحدد');
  const [isPublishing, setIsPublishing] = useState(false);

  async function publishAd() {
    if (!fromLocation.trim() || !toLocation.trim()) {
      show('يرجى إدخال مكان الانطلاق والوجهة', 'warning');
      return;
    }

    setIsPublishing(true);
    try {
      await http.post(endpoints.vacancyAds, {
        fromLocation: fromLocation.trim(),
        toLocation: toLocation.trim(),
        departureDate: 'اليوم',
        departureTime: departureTime.trim(),
        availableSeats,
        pricePerSeatIqd: parseInt(price, 10) || 3000,
        notes: notes.trim(),
      });
      show('تم نشر إعلان الرحلة بنجاح! سيتمكن الركاب من رؤيته والتواصل معك. ✅', 'success', 3000);
      navigate('/ads');
    } catch {
      show('تعذر نشر الإعلان، حاول مجدداً', 'error');
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <header className="flex h-14 items-center gap-2 bg-brand-slate px-3 text-white">
        <button
          type="button"
          onClick={() => navigate('/ads')}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"
          aria-label="رجوع"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold">نشر إعلان رحلة شاغرة</h1>
        <span className="w-10" />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto p-5">
        <Field label="مكان الانطلاق *" placeholder="مثال: ساحة ثورة العشرين" value={fromLocation} onChange={(e) => setFromLocation(e.target.value)} />
        <Field label="الوجهة *" placeholder="مثال: جامعة الكوفة" value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
        <Field label="وقت الانطلاق *" placeholder="08:00 ص" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-brand-slate">المقاعد الشاغرة: {availableSeats}</span>
          <input
            type="range"
            min={1}
            max={6}
            value={availableSeats}
            onChange={(e) => setAvailableSeats(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </label>

        <Field label="سعر المقعد (د.ع)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-brand-slate">ملاحظات للركاب</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-brand-slate outline-none focus:border-brand-amber"
          />
        </label>

        <Button variant="primary" className="w-full" onClick={() => void publishAd()} disabled={isPublishing}>
          {isPublishing ? <Spinner /> : '📣 نشر الإعلان'}
        </Button>
      </main>
    </div>
  );
}
