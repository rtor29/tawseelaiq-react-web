// رفع المستمسكات والوثائق — بديل document_upload_screen.dart
// اختيار ملف (صورة/كاميرا) + معاينة + رفع Base64 إلى /documents/upload

import { useRef, useState } from 'react';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { Button, SelectField, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from '../components/ThemeToggleButton';

const DOC_TYPES: Record<string, string> = {
  DrivingLicense: 'إجازة السوق (رخصة القيادة)',
  NationalId: 'البطاقة الوطنية الموحدة',
  VehicleRegistration: 'سنوية المركبة (ملكية السيارة)',
  BackgroundCheck: 'شهادة عدم المحكومية',
};

export default function DocumentUploadPage() {
  const { show } = useToast();
  const { isDark } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const driverId = authStore.getSession()?.userId ?? 'usr-driver';

  const [docType, setDocType] = useState('DrivingLicense');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  function onFileSelected(file: File | null) {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
  }

  function openPicker() {
    fileRef.current?.click();
  }

  async function uploadDocument() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await http.post(endpoints.uploadDocument, {
        driverId,
        documentType: docType,
        fileName: file.name || `doc_${Date.now()}.jpg`,
        fileBase64: base64,
      });
      show('تم رفع المستمسك بنجاح وسيتلقى المشرف إشعاراً للتدقيق! ✅', 'success', 3000);
    } catch {
      show('تعذر الرفع، يرجى المحاولة مرة أخرى أو فحص الاتصال.', 'error');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className={`flex h-dvh flex-col text-right font-cairo transition-colors duration-200 ${
      isDark ? 'bg-[#080E1A] text-white' : 'bg-[#F8FAFC] text-slate-900'
    }`} dir="rtl">
      <TopBar
        title="رفع المستمسكات والوثائق"
        actions={<ThemeToggleButton />}
      />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-5 overflow-y-auto p-5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture={undefined}
          hidden
          onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
        />

        <div className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
          isDark
            ? 'bg-blue-950/30 border-blue-500/30 text-blue-200'
            : 'bg-blue-50 border-blue-200 text-slate-600'
        }`}>
          <span className="text-blue-500 text-lg">🛡️</span>
          <p className="text-xs leading-relaxed">
            جميع الوثائق تُحفظ في خادم آمن ومشفر للمشرفين فقط، لتوثيق حسابك وضمان أمان الرحلات.
          </p>
        </div>

        <SelectField
          label="اختر نوع الوثيقة:"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className={isDark ? 'bg-[#161C28] text-white border-slate-700' : ''}
        >
          {Object.entries(DOC_TYPES).map(([value, label]) => (
            <option key={value} value={value} className={isDark ? 'bg-[#161C28] text-white' : ''}>
              {label}
            </option>
          ))}
        </SelectField>

        {/* منطقة الاختيار/المعاينة */}
        <button
          type="button"
          onClick={openPicker}
          disabled={isUploading}
          className={`block w-full overflow-hidden rounded-2xl border-2 text-center transition ${
            isDark ? 'bg-[#161C28] shadow-lg' : 'bg-white shadow-card'
          } ${
            previewUrl
              ? 'border-emerald-500'
              : isDark ? 'border-amber-500/40 hover:border-amber-500' : 'border-amber-400 hover:border-amber-500'
          }`}
        >
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="معاينة المستند" className="h-56 w-full object-cover" />
              <div className={`flex items-center gap-2 px-4 py-3 text-right ${
                isDark ? 'bg-[#1A2234] border-t border-slate-700/60' : 'bg-slate-50 border-t border-slate-100'
              }`}>
                <span className="text-emerald-500">✅</span>
                <span className={`flex-1 truncate text-[13px] font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  {fileName || 'تم تحديد الصورة بنجاح'}
                </span>
                <span className="text-xs font-bold text-amber-500">تغيير</span>
              </div>
            </>
          ) : (
            <div className="px-6 py-10">
              <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
                isDark ? 'bg-amber-500/20' : 'bg-amber-50'
              }`}>
                🖼️
              </span>
              <p className={`mt-3 text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                اضغط لاختيار صورة من جهازك أو التقاطها بالكاميرا
              </p>
              <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                يدعم صور الهوية ورخصة القيادة والسنوية (JPG, PNG)
              </p>
            </div>
          )}
        </button>

        <Button
          variant="primary"
          className="w-full py-3 text-sm font-bold shadow-lg shadow-amber-500/20"
          onClick={() => void uploadDocument()}
          disabled={!previewUrl || isUploading}
        >
          {isUploading ? <Spinner /> : '☁️'} {isUploading ? 'جاري الرفع والاعتماد...' : 'رفع المستمسك للاعتماد'}
        </Button>
      </main>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
