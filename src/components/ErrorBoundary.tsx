import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-slate-950 text-white font-cairo select-none"
        >
          <div className="w-full max-w-md bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-3xl">
              🚕
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-white">
                {this.props.fallbackMessage || 'حدث خطأ مؤقت في تحميل الواجهة'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                بيانات مشوارك وحسابك محفوظة بأمان. يرجى إعادة المحاولة أو تحديث الصفحة للمتابعة.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.98] text-slate-950 font-black text-sm transition shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🔄</span>
                <span>إعادة تحميل الصفحة</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="min-h-[48px] py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.98] text-slate-300 font-bold text-xs transition border border-white/10 cursor-pointer"
              >
                المحاولة مجدداً
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
