import React, { useState } from 'react';

export interface CommuteCancelModalProps {
  isOpen: boolean;
  isDark: boolean;
  driverName?: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details: string) => void;
}

const DEFAULT_REASONS = [
  'تغير أوقات الدوام',
  'العثور على بديل',
  'عدم التزام السائق',
  'ظروف شخصية',
  'أخرى',
];

export const CommuteCancelModal: React.FC<CommuteCancelModalProps> = ({
  isOpen,
  isDark,
  driverName,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const [cancelReason, setCancelReason] = useState<string>('تغير أوقات الدوام');
  const [cancelDetails, setCancelDetails] = useState<string>('');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
      dir="rtl"
    >
      <div
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl text-right space-y-4 ${
          isDark ? 'bg-[#1e293b] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-2xl'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <h3 className="text-[16px] font-black">طلب إلغاء الاشتراك في الخط</h3>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-full p-1 transition cursor-pointer ${
              isDark ? 'text-white/50 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            ✕
          </button>
        </div>

        <p className={`text-[13px] ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
          يرجى تحديد سبب الإلغاء لمراجعته مع الكابتن ({driverName || 'الكابتن'}):
        </p>

        {/* الأسباب الجاهزة */}
        <div className="space-y-2">
          {DEFAULT_REASONS.map((r) => (
            <label
              key={r}
              onClick={() => setCancelReason(r)}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                cancelReason === r
                  ? isDark
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                    : 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <span className="text-[13.5px]">{r}</span>
              <div
                className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                  cancelReason === r ? 'border-amber-400 bg-amber-400' : isDark ? 'border-white/30' : 'border-slate-300'
                }`}
              >
                {cancelReason === r && <div className="h-2 w-2 rounded-full bg-slate-950" />}
              </div>
            </label>
          ))}
        </div>

        {/* حقل تفاصيل إضافية */}
        <div>
          <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
            ملاحظات وتفاصيل إضافية (اختياري):
          </label>
          <textarea
            value={cancelDetails}
            onChange={(e) => setCancelDetails(e.target.value)}
            rows={2}
            placeholder="اكتب أي ملاحظة تود توضيحها للكابتن..."
            className={`w-full rounded-xl border p-2.5 text-[13px] outline-none transition focus:ring-2 focus:ring-amber-500/40 ${
              isDark
                ? 'bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:border-amber-400'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500'
            }`}
          />
        </div>

        {/* أزرار التأكيد أو الإلغاء */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onSubmit(cancelReason, cancelDetails)}
            className="flex-1 min-h-[48px] py-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-[14px] shadow-lg shadow-red-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="animate-pulse">جاري إرسال الطلب...</span>
            ) : (
              <span>تأكيد إرسال طلب الإلغاء</span>
            )}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className={`px-4 min-h-[48px] py-3 rounded-xl border text-[13px] font-bold transition cursor-pointer ${
              isDark ? 'border-white/15 text-white/80 hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            تراجع
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommuteCancelModal;
