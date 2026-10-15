// الدعم الفني والشكاوى — بديل contact_support_screen.dart

import { useState } from 'react';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { Button, Field, SelectField, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const CATEGORIES = ['شكوى سائق', 'شكوى راكب', 'مشكلة تقنية', 'اقتراح تحسين', 'أخرى'];
const SUPPORT_WHATSAPP = 'https://wa.me/9647706204066';
const SUPPORT_PHONE = 'tel:07706204066';

export default function SupportPage() {
  const { show } = useToast();
  const session = authStore.getSession();

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function submitComplaint() {
    if (!subject.trim() || !details.trim()) {
      show('يرجى إدخال موضوع الشكوى وتفاصيلها', 'warning');
      return;
    }

    setIsSending(true);
    try {
      await http.post(endpoints.complaints, {
        userId: session?.userId ?? 'usr-anonymous',
        userName: session?.fullName ?? 'مستخدم',
        userRole: session?.role ?? 'Customer',
        category,
        subject: subject.trim(),
        details: details.trim(),
        createdAt: new Date().toISOString(),
      });
      show('تم إرسال شكواك بنجاح! سيتواصل معك فريق الدعم قريباً. ✅', 'success');
      setSubject('');
      setDetails('');
    } catch {
      show('تعذر إرسال الشكوى، حاول مجدداً أو تواصل عبر واتساب', 'error');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-brand-surface">
      <header className="flex h-14 items-center gap-2 bg-brand-slate px-3 text-white">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"
          aria-label="رجوع"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold">الدعم الفني والشكاوى</h1>
        <span className="w-10" />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          <a href={SUPPORT_PHONE} className="rounded-2xl bg-white p-4 text-center shadow-card">
            <span className="text-2xl">📞</span>
            <p className="mt-1 text-xs font-bold text-brand-slate">اتصال مباشر بالدعم</p>
          </a>
          <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer" className="rounded-2xl bg-white p-4 text-center shadow-card">
            <span className="text-2xl">💬</span>
            <p className="mt-1 text-xs font-bold text-brand-slate">واتساب الدعم الفني</p>
          </a>
        </div>

        <SelectField label="نوع البلاغ" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </SelectField>

        <Field label="موضوع الشكوى *" placeholder="عنوان مختصر للمشكلة" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-brand-slate">التفاصيل *</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            placeholder="اشرح المشكلة بالتفصيل (الوقت، المكان، رقم الرحلة إن وجد)..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-brand-slate outline-none focus:border-brand-amber"
          />
        </label>

        <Button variant="primary" className="w-full" onClick={() => void submitComplaint()} disabled={isSending}>
          {isSending ? <Spinner /> : '📨 إرسال الشكوى'}
        </Button>
      </main>
    </div>
  );
}
