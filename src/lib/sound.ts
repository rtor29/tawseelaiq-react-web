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

// تشغيل نغمة هورن السيارة الواقعية ("بيب بيب 🚖")
export function playCarHornBeep(): void {
  try {
    // 1. الاهتزاز التفاعلي في أجهزة الموبايل (Haptic Vibration) بنبضتين متتاليتين
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([140, 90, 200]);
      } catch (_) {}
    }

    // 2. خط الدفاع الأساسي: توليد نغمة ثنائية واقعية برمجياً عبر Web Audio API
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // دالة لتوليد نبضة هورن واحدة بتردد مزدوج (Dual Tone F4 @ 415Hz + G#4 @ 495Hz)
      const playPulse = (startTime: number, duration: number, peakGain = 0.35) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const biquadFilter = ctx.createBiquadFilter();

        // الترددات الحقيقية لهورن سيارات الأجرة الحديثة (تويوتا / هيونداي)
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(415, startTime);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(495, startTime);

        // فلتر لتقليل الحدة ومحاكاة الصندوق الصوتي الخارجي للسيارة
        biquadFilter.type = 'lowpass';
        biquadFilter.frequency.setValueAtTime(2600, startTime);

        // تشكيل الغلاف الصوتي (Envelope: هجوم فوري + استقرار + إخماد سريع)
        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
        gainNode.gain.setValueAtTime(peakGain, startTime + duration - 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc1.connect(biquadFilter);
        osc2.connect(biquadFilter);
        biquadFilter.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
      };

      // نبضة أولى: "بيب" (140 مللي ثانية)
      playPulse(now + 0.04, 0.14, 0.35);
      // نبضة ثانية: "بيب" (200 مللي ثانية) بعد فاصل 90 مللي ثانية
      playPulse(now + 0.27, 0.20, 0.38);
    }

    // 3. خط الدفاع الاحتياطي: محاولة تشغيل ملف صوتي خارجي إن وُجد
    try {
      const audio = new Audio('/sounds/car-horn.mp3');
      audio.volume = 0.75;
      audio.play().catch(() => {
        // يتم تجاهل الخطأ في حال حجب الـ Autoplay لأن المولد البرمجي أعلاه تكفل بالصوت
      });
    } catch (_) {}
  } catch (err) {
    console.warn('[Sound] Car horn playback notice:', err);
  }
}
