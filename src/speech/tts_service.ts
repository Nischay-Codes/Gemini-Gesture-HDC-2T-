/**
 * Web Speech API Real-Time Speech Synthesis Service
 * 
 * Configured for a soothing, natural female voice:
 * - Prioritizes Samantha, Ava, Victoria, Karen, Moira (Mac/iOS/Chrome natural female voices)
 * - Calibrated relaxed rate (0.95) and gentle warm pitch (1.02)
 * - Anti-stutter hysteresis filter
 * - Real-time visualizer waveform synchronization
 */

export class TtsService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private cooldownMs: number = 3200;
  private isEnabled: boolean = true;
  private subtitleCallback: ((text: string) => void) | null = null;
  private onSpeakingStateChange: ((isSpeaking: boolean) => void) | null = null;
  private onVoicesLoadedCallback: ((voices: SpeechSynthesisVoice[], selected: SpeechSynthesisVoice | null) => void) | null = null;

  // Preferred soothing female voices ranking
  private static readonly SOOTHING_FEMALE_PRIORITY = [
    'samantha',   // macOS classic warm soothing female
    'ava',         // macOS modern neural female
    'victoria',    // British smooth female
    'karen',       // Australian warm female
    'moira',       // Irish melodic female
    'tessa',       // South African gentle female
    'serena',      // British clear female
    'zoe',         // Natural female
    'allison',     // US natural female
    'susan',       // US gentle female
    'zira'         // Windows clean female
  ];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  public setOnVoicesLoaded(cb: (voices: SpeechSynthesisVoice[], selected: SpeechSynthesisVoice | null) => void): void {
    this.onVoicesLoadedCallback = cb;
    if (this.voices.length > 0) {
      cb(this.voices, this.preferredVoice);
    }
  }

  private initVoices(): void {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    if (this.voices.length === 0) return;

    const savedVoiceName = localStorage.getItem('VOX_PREFERRED_VOICE');
    if (savedVoiceName) {
      const match = this.voices.find(v => v.name === savedVoiceName);
      if (match) {
        this.preferredVoice = match;
        if (this.onVoicesLoadedCallback) this.onVoicesLoadedCallback(this.voices, this.preferredVoice);
        return;
      }
    }

    // Find best soothing female voice in English
    let bestMatch: SpeechSynthesisVoice | null = null;

    for (const nameKey of TtsService.SOOTHING_FEMALE_PRIORITY) {
      const found = this.voices.find(v => 
        v.lang.startsWith('en') && v.name.toLowerCase().includes(nameKey)
      );
      if (found) {
        bestMatch = found;
        break;
      }
    }

    // Fallback to any voice with "female" or "natural"
    if (!bestMatch) {
      bestMatch = this.voices.find(v => 
        v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('natural'))
      ) || null;
    }

    // General English fallback
    if (!bestMatch) {
      bestMatch = this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
    }

    this.preferredVoice = bestMatch;
    if (this.preferredVoice) {
      console.log(`Speech Voice Selected: "${this.preferredVoice.name}" (${this.preferredVoice.lang})`);
    }

    if (this.onVoicesLoadedCallback) {
      this.onVoicesLoadedCallback(this.voices, this.preferredVoice);
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  public getPreferredVoice(): SpeechSynthesisVoice | null {
    return this.preferredVoice;
  }

  public setVoiceByName(voiceName: string): boolean {
    const found = this.voices.find(v => v.name === voiceName);
    if (found) {
      this.preferredVoice = found;
      localStorage.setItem('VOX_PREFERRED_VOICE', found.name);
      console.log(`Voice switched to: "${found.name}"`);
      return true;
    }
    return false;
  }

  public setSubtitleCallback(cb: (text: string) => void): void {
    this.subtitleCallback = cb;
  }

  public setSpeakingStateCallback(cb: (isSpeaking: boolean) => void): void {
    this.onSpeakingStateChange = cb;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled && this.synth) {
      this.synth.cancel();
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public speak(text: string, force = false): void {
    if (!this.isEnabled || !text || text.trim() === '') return;
    const clean = text.trim();
    const now = Date.now();

    // Hysteresis cooldown: don't repeat the exact same sentence unless 3.2s passed or forced
    if (!force && clean.toLowerCase() === this.lastSpokenText.toLowerCase() && (now - this.lastSpokenTime) < this.cooldownMs) {
      return;
    }

    this.lastSpokenText = clean;
    this.lastSpokenTime = now;

    if (this.subtitleCallback) {
      this.subtitleCallback(clean);
    }

    if (!this.synth) {
      console.warn('SpeechSynthesis API not supported in this browser.');
      return;
    }

    // Cancel ongoing speech for instant responsiveness
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }

    // Soothing natural cadence: slightly relaxed rate, gentle pitch
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(true);
    };

    utterance.onend = () => {
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
    };

    utterance.onerror = () => {
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
    };

    this.synth.speak(utterance);
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
      if (this.onSpeakingStateChange) this.onSpeakingStateChange(false);
    }
  }
}
