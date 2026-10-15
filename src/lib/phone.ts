// مدقق أرقام الهواتف العراقية — نقل حرفي لـ iraqi_phone_validator.dart
// (حصر شبكتي زين وآسيا سيل فقط)

export type IraqiOperator = 'asiacell' | 'zain' | 'korek' | 'unsupported' | 'unknown';

export interface IraqiPhoneValidation {
  isValid: boolean;
  operator: IraqiOperator;
  normalizedLocalNumber: string; // 07701234567
  normalizedE164Number: string; // +9647701234567
  errorMessage?: string;
}

export const INVALID_PHONE_MESSAGE =
  'يرجى إدخال رقم هاتف عراقي صالح (زين أو آسيا سيل فقط)';

const LOCAL_REGEX = /^(077|078|079)[0-9]{8}$/;
const INTL_REGEX = /^(\+?964)(77|78|79)[0-9]{8}$/;

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function sanitizePhone(input: string): string {
  let cleaned = input.replace(/[\s\-().]/g, '').trim();
  ARABIC_DIGITS.forEach((d, i) => {
    cleaned = cleaned.split(d).join(String(i));
  });
  return cleaned;
}

export function detectOperator(input: string): IraqiOperator {
  const clean = sanitizePhone(input);
  if (!clean) return 'unknown';

  let digits = clean;
  if (digits.startsWith('+964')) digits = digits.slice(4);
  else if (digits.startsWith('964')) digits = digits.slice(3);
  else if (digits.startsWith('00964')) digits = digits.slice(5);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.startsWith('77')) return 'asiacell';
  if (digits.startsWith('78') || digits.startsWith('79')) return 'zain';
  if (digits.startsWith('75')) return 'korek';
  if (digits.length >= 2) return 'unsupported';
  return 'unknown';
}

export function validateIraqiPhone(input: string): IraqiPhoneValidation {
  const clean = sanitizePhone(input);

  if (!clean) {
    return {
      isValid: false,
      operator: 'unknown',
      normalizedLocalNumber: '',
      normalizedE164Number: '',
      errorMessage: INVALID_PHONE_MESSAGE,
    };
  }

  const isLocal = LOCAL_REGEX.test(clean);
  const isIntl = INTL_REGEX.test(clean);

  if (!isLocal && !isIntl) {
    return {
      isValid: false,
      operator: detectOperator(clean),
      normalizedLocalNumber: clean,
      normalizedE164Number: clean,
      errorMessage: INVALID_PHONE_MESSAGE,
    };
  }

  let coreDigits: string;
  if (clean.startsWith('+964')) coreDigits = clean.slice(4);
  else if (clean.startsWith('964')) coreDigits = clean.slice(3);
  else if (clean.startsWith('0')) coreDigits = clean.slice(1);
  else coreDigits = clean;

  const op: IraqiOperator = coreDigits.startsWith('77') ? 'asiacell' : 'zain';

  return {
    isValid: true,
    operator: op,
    normalizedLocalNumber: `0${coreDigits}`,
    normalizedE164Number: `+964${coreDigits}`,
  };
}

export function operatorDisplayName(op: IraqiOperator): string {
  switch (op) {
    case 'asiacell':
      return 'آسيا سيل (Asiacell)';
    case 'zain':
      return 'زين العراق (Zain Iraq)';
    case 'korek':
      return 'كورك (غير مدعومة)';
    default:
      return 'مشغل غير مدعوم';
  }
}

export function operatorColor(op: IraqiOperator): string {
  switch (op) {
    case 'asiacell':
      return '#E11D48';
    case 'zain':
      return '#0284C7';
    case 'korek':
      return '#EA580C';
    default:
      return '#64748B';
  }
}

// توحيد رقم الهاتف كما في شاشات Flutter (register/login)
export function normalizePhoneLoose(phone: string): string {
  let p = phone;
  ARABIC_DIGITS.forEach((d, i) => {
    p = p.split(d).join(String(i));
  });
  let digits = p.replace(/[^0-9]/g, '');
  if (digits.startsWith('00964')) digits = digits.slice(5);
  if (digits.startsWith('964')) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith('7')) digits = `0${digits}`;
  return digits;
}
