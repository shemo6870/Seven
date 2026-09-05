export const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    // Modern messaging sound (soft, pure tones)
    const playTone = (freq: number, startTime: number, duration: number, vol: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      // Use sine for a very soft, pure tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      // Gentle attack and decay for a smooth pop
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Soft ascending double tone (nice, modern, unobtrusive)
    // C5 (523.25 Hz) -> E5 (659.25 Hz)
    playTone(523.25, now, 0.2, 0.6);
    playTone(659.25, now + 0.12, 0.4, 0.6);

  } catch (e) {
    console.error("Audio playback failed:", e);
  }
};

// Initialize audio helper
const setupAudioInteraction = () => {
    if (typeof window !== 'undefined') {
        const init = () => {
           try {
             // Just creating an context and immediately suspending/closing is enough to whitelist audio for this session on some browsers.
             const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
             if (AudioContextClass) {
                 const ctx = new AudioContextClass();
                 ctx.resume();
             }
           } catch(e) {}
           
           // Remove listeners once done
           document.removeEventListener('click', init);
           document.removeEventListener('touchstart', init);
        };
        document.addEventListener('click', init, { once: true });
        document.addEventListener('touchstart', init, { once: true });
    }
};

setupAudioInteraction();
