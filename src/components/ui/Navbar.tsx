import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { to: '/map', label: '🚗 مشوار', roles: ['Customer'] },
  { to: '/daily', label: '🛣️ خطوط', roles: ['Customer'] },
  { to: '/driver', label: '🧭 لوحتي', roles: ['Driver'] },
  { to: '/admin', label: '⚙️ الإدارة', roles: ['Admin'] },
];

export default function Navbar() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const logout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <nav className="fixed top-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <NavLink to="/" className="text-primary font-extrabold text-lg">🚕 توصيلة</NavLink>

        <div className="flex items-center gap-1">
          {navItems
            .filter((n) => !user || n.roles.includes(user.role))
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}

          {user ? (
            <button
              onClick={logout}
              className="mr-2 text-xs text-gray-400 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg"
            >
              خروج
            </button>
          ) : (
            <NavLink
              to="/login"
              className="mr-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
            >
              دخول
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}
