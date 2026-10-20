// مولد المؤثرات الصوتية ومنظومة هندسة الصوت (Web Audio API & Sound Engineering)
// مصمم خصيصاً لتجاوز قيود Autoplay في متصفحات الموبايل (Safari iOS & Android Chrome)

let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// فك قفل كائن الـ AudioContext تلقائياً عند أول لمسة أو نقرة للمستخدم على الشاشة
export function initAudioUnlock(): void {
  if (typeof window === 'undefined' || isAudioUnlocked) return;

  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            isAudioUnlocked = true;
          }).catch(() => {});
        } else if (ctx.state === 'running') {
          isAudioUnlocked = true;
        }
      }
    } catch (_) {}

    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

// تشغيل نغمة هورن السيارة الواقعية ("بيب بيب 🚖") بالتزامن مع الاهتزاز القوي
export function playRealisticHorn(): void {
  try {
    // 1. تشغيل اهتزاز قوي ومميز لهاتف الراكب
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([250, 100, 250, 100, 400]);
      } catch (_) {}
    }

    // 2. توليف نغمة هورن ثنائية واقعية "بيب بيب" عبر Web Audio API (F4 @ 415Hz و G#4 @ 495Hz)
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const playBeep = (startTime: number, duration: number) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // توليف ترددي مزدوج يعطي صوت هورن السيارة الواقعي (F4 و G#4)
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(415, startTime);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(495, startTime);

        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
      };

      // نغمة مزدوجة واقعية "بيب بيب"
      playBeep(ctx.currentTime, 0.18);
      playBeep(ctx.currentTime + 0.24, 0.22);
    }

    // 3. خط الدفاع الاحتياطي: تشغيل ملف الصوت في الخلفية
    try {
      const audio = new Audio('/sounds/car-horn.mp3');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch (_) {}
  } catch (err) {
    console.warn('[Sound] Car horn playback notice:', err);
  }
}

// دالة التوافق العامة
export const playCarHornBeep = playRealisticHorn;

// تشغيل نغمة تنبيه طلب الرحلة الجديد للكابتن
export function playIncomingTripAlert(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([200, 100, 200, 100, 350]);
      } catch (_) {}
    }

    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.23);
      });
    }
  } catch (err) {
    console.warn('[Sound] Trip alert notice:', err);
  }
}
