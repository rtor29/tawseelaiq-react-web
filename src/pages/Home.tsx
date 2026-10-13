import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function Home() {
  const { user } = useAuthStore();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 pt-16">
      <div className="text-6xl mb-4">🚕</div>
      <h1 className="text-4xl font-extrabold text-primary mb-2">توصيلة IQ</h1>
      <p className="text-gray-400 text-lg mb-8">تطبيق الأجرة الذكية في العراق</p>
      <div className="flex flex-col sm:flex-row gap-4">
        {user ? (
          <>
            <Link to="/map" className="bg-primary text-white px-6 py-3 rounded-xl font-bold text-lg hover:bg-orange-600 transition">
              🚗 اطلب مشواراً
            </Link>
            <Link to="/daily" className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold text-lg hover:bg-white/20 transition border border-white/20">
              🛣️ الخطوط الدائمية
            </Link>
          </>
        ) : (
          <Link to="/login" className="bg-primary text-white px-8 py-3 rounded-xl font-bold text-lg hover:bg-orange-600 transition">
            ابدأ الآن
          </Link>
        )}
      </div>

      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        {[
          { icon: '⚡', title: 'سريع', desc: 'احجز في ثوانٍ بدون انتظار' },
          { icon: '🗺️', title: 'ذكي', desc: 'مطابقة الخطوط الدائمية بدقة' },
          { icon: '🔒', title: 'آمن', desc: 'سائقون معتمدون وموثوقون' },
        ].map((f) => (
          <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="text-3xl mb-2">{f.icon}</div>
            <h3 className="font-bold text-lg mb-1">{f.title}</h3>
            <p className="text-gray-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
