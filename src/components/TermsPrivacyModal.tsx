import { useEffect, useState } from 'react';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  initialTab?: 'terms' | 'privacy';
  onClose: () => void;
}

export default function TermsPrivacyModal({
  isOpen,
  initialTab = 'terms',
  onClose,
}: TermsPrivacyModalProps) {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in font-cairo select-none"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[88vh] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden text-right animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ترويسة النافذة المنبثقة */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-xl shadow-xs">
              📜
            </div>
            <div>
              <h3 className="text-[17px] font-black text-slate-900 leading-tight">
                اتفاقية الخدمة والخصوصية
              </h3>
              <p className="text-[12px] font-semibold text-slate-500">
                منصة توصيلة (Tawseela IQ)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition active:scale-95 cursor-pointer"
            aria-label="إغلاق"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* أزرار التبديل بين التبويبين (Tabs) */}
        <div className="flex border-b border-slate-200/80 bg-slate-100/60 p-1.5 mx-6 mt-4 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📜</span>
            <span>شروط الاستخدام</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-[14px] font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛡️</span>
            <span>سياسة الخصوصية</span>
          </button>
        </div>

        {/* جسم المحتوى القابل للتمرير بسلاسة */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-slate-700 leading-relaxed text-[13.5px]">
          {activeTab === 'terms' ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-[13px] font-bold">
                🚖 أهلاً بك في منصة «توصيلة» لنقل الركاب. باستخدامك للتطبيق فأنت توافق على الالتزام بالقواعد والضوابط المعتمدة أدناه.
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-amber-600">١.</span>
                    <span>قواعد الركوب والآداب العامة</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يلتزم الراكب بالاحترام المتبادل مع الكابتن والمحافظة على سلامة ونظافة السيارة. يمنع التدخين تماماً داخل المركبة، كما يُحظر حمل أي مواد خطرة أو غير قانونية.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-amber-600">٢.</span>
                    <span>شفافية الأجرة وتسعيرة بلي المعتمدة</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يتم احتساب تكلفة المشوار آلياً بدقة متناهية بناءً على المسافة الحقيقية والوقت المقدر بنظام تسعيرة بلي (Baly Model) بالدينار العراقي. السعر المعروض قبل تأكيد الطلب هو السعر النهائي والعادل، ولا يجوز للكابتن أو الراكب فرض أي مبالغ إضافية غير معلنة.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-amber-600">٣.</span>
                    <span>حقوق ومسؤوليات الكابتن والراكب</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يلتزم الكابتن بالوصول بالمركبة المحددة وبيانات اللوحة المعتمدة في النظام. يلتزم الراكب بالصعود فور وصول الكابتن لموقع الانطلاق، ويحق للكابتن إطلاق تنبيه (بيب بيب 📢) لتذكير الراكب بوجوده.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-amber-600">٤.</span>
                    <span>سياسة الإلغاء العادلة</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يحق للراكب إلغاء الرحلة مجاناً قبل بدء تحرك الكابتن، مع ضرورة اختيار سبب الإلغاء من القائمة المتاحة لتحسين جودة الأسطول. تكرار الإلغاء غير المبرر بعد وصول الكابتن قد يعرض الحساب للتعليق المؤقت.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-[#1B4965] text-[13px] font-bold">
                🛡️ نولي خصوصيتك وأمان بياناتك أهمية قصوى. نلتزم بأعلى معايير التشفير وحماية البيانات الشخصية.
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-sky-700">١.</span>
                    <span>تشفير وحماية رقم الهاتف</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يتم تخزين رقم هاتفك وبياناتك مشفرة ولا يتم إتاحتها للعامة إطلاقاً. يُستخدم رقم الهاتف فقط للتحقق عبر رمز الأمان (OTP) وللتواصل الآمن بين الكابتن والراكب لإتمام الرحلة.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-sky-700">٢.</span>
                    <span>حصر الموقع الجغرافي (GPS) على مسار الرحلة</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    يقتصر استخدام إحداثيات الموقع على تحديد نقطة الانطلاق والوصول وتوجيه الكابتن أثناء الرحلة الجارية فقط. يتوقف التطبيق تماماً عن متابعة موقعك فور اكتمال المشوار أو إلغائه.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-sky-700">٣.</span>
                    <span>عدم مشاركة البيانات مع أطراف ثالثة</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    نحن لا نقوم ببيع أو تأجير أو مشاركة أي بيانات شخصية أو سجلات مشاوير مع أي شركات إعلانية أو جهات تجارية خارجية تحت أي ظرف.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-xs">
                  <h4 className="font-black text-slate-900 text-[15px] mb-1.5 flex items-center gap-2">
                    <span className="text-sky-700">٤.</span>
                    <span>سرية التقييمات والبلاغات</span>
                  </h4>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    كافة التقييمات والشكاوى والبلاغات المقدمة من خلال التطبيق تُعالج بأعلى درجات السرية والحيادية من قِبل المشرفين لحماية حقوق الجميع.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* زر الإغلاق السفلي العريض والمريح للمس */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[50px] rounded-2xl bg-[#1B4965] hover:bg-[#14364A] text-white font-black text-[15px] shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>فهمت وموافق</span>
            <span>✅</span>
          </button>
        </div>
      </div>
    </div>
  );
}
