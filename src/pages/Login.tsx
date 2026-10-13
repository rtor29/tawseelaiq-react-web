import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Step = 'phone' | 'otp' | 'role';

export default function Login() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handlePhone = async () => {
    if (!phone.trim()) return;
    setLoading(true); setError('');
    try {
      await authApi.sendOtp(phone.trim());
      setStep('otp');
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleOtp = async () => {
    if (!otp.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await authApi.verifyOtp(phone, otp);
      const user = {
        id: res.user.id,
        fullName: res.user.fullName ?? res.user.full_name ?? 'مستخدم',
        phone: res.user.phone,
        role: res.user.role ?? 'Customer',
        image: res.user.image,
        token: res.token,
      };
      setAuth(user, res.token);
      navigate(user.role === 'Admin' ? '/admin' : user.role === 'Driver' ? '/driver' : '/map');
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🚕</div>
          <h1 className="text-2xl font-extrabold text-primary">توصيلة IQ</h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === 'phone' ? 'أدخل رقمك للمتابعة' : 'أدخل رمز التحقق المرسل'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {step === 'phone' && (
          <>
            <Input
              label="رقم الهاتف"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="+964xxxxxxxxxx"
              dir="ltr"
            />
            <Button fullWidth loading={loading} onClick={handlePhone} className="mt-4">
              إرسال رمز التحقق
            </Button>
          </>
        )}

        {step === 'otp' && (
          <>
            <p className="text-gray-400 text-sm mb-4 text-center">
              تم إرسال رمز التحقق إلى <span className="text-white font-bold" dir="ltr">{phone}</span>
            </p>
            <Input
              label="رمز التحقق"
              value={otp}
              onChange={setOtp}
              type="text"
              placeholder="123456"
              dir="ltr"
            />
            <Button fullWidth loading={loading} onClick={handleOtp} className="mt-4">
              تأكيد
            </Button>
            <button onClick={() => setStep('phone')} className="w-full text-center text-gray-400 text-sm mt-3 hover:text-white">
              تغيير الرقم
            </button>
          </>
        )}
      </div>
    </div>
  );
}
