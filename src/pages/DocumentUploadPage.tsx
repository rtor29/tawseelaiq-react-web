// رفع المستمسكات والوثائق — بديل document_upload_screen.dart
// اختيار ملف (صورة/كاميرا) + معاينة + رفع Base64 إلى /documents/upload

import { useRef, useState } from 'react';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { Button, SelectField, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const DOC_TYPES: Record<string, string> = {
  DrivingLicense: 'إجازة السوق (رخصة القيادة)',
  NationalId: 'البطاقة الوطنية الموحدة',
  VehicleRegistration: 'سنوية المركبة (ملكية السيارة)',
  BackgroundCheck: 'شهادة عدم المحكومية',
};

export default function DocumentUploadPage() {
  const { show } = useToast();
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
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <TopBar title="رفع المستمسكات والوثائق" />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-5 overflow-y-auto p-5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture={undefined}
          hidden
          onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
        />

        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <span className="text-blue-600">🛡️</span>
          <p className="text-xs leading-relaxed text-slate-600">
            جميع الوثائق تُحفظ في خادم آمن وخاص للمشرفين فقط بالنجف الأشرف، لتوثيق حسابك وضمان أمان الرحلات.
          </p>
        </div>

        <SelectField label="اختر نوع الوثيقة:" value={docType} onChange={(e) => setDocType(e.target.value)}>
          {Object.entries(DOC_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>

        {/* منطقة الاختيار/المعاينة */}
        <button
          type="button"
          onClick={openPicker}
          disabled={isUploading}
          className={`block w-full overflow-hidden rounded-2xl border-2 bg-white text-center shadow-card transition ${
            previewUrl ? 'border-brand-emerald' : 'border-amber-400'
          }`}
        >
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="معاينة المستند" className="h-56 w-full object-cover" />
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-right">
                <span className="text-brand-emerald">✅</span>
                <span className="flex-1 truncate text-[13px] font-semibold text-brand-slate">{fileName || 'تم تحديد الصورة بنجاح'}</span>
                <span className="text-xs font-bold text-brand-amber">تغيير</span>
              </div>
            </>
          ) : (
            <div className="px-6 py-10">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl">🖼️</span>
              <p className="mt-3 text-sm font-extrabold text-brand-slate">
                اضغط لاختيار صورة من جهازك أو التقاطها بالكاميرا
              </p>
              <p className="mt-1 text-xs text-slate-500">يدعم صور الهوية ورخصة القيادة والسنوية (JPG, PNG)</p>
            </div>
          )}
        </button>

        <Button
          variant="primary"
          className="w-full"
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
