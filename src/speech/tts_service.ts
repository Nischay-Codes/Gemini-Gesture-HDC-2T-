/**
 * GeminiGesture: Web Speech API Real-Time Speech Synthesis Service
 * 
 * Provides an audible voice for non-verbal individuals:
 * - Natural cadence & volume
 * - Intelligent anti-repetition cooldown (prevents stutter if gesture held)
 * - Subtitle broadcast callback
 */

export class TtsService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private cooldownMs: number = 2500;
  private isEnabled: boolean = true;
  private subtitleCallback: ((text: string) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices(): void {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    this.preferredVoice = this.voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  public setSubtitleCallback(cb: (text: string) => void): void {
    this.subtitleCallback = cb;
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled && this.synth) {
      this.synth.cancel();
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public speak(text: string, force = false): void {
    if (!this.isEnabled || !text || text.trim() === '') return;
    const clean = text.trim();
    const now = Date.now();

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
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    this.synth.speak(utterance);
  }

  public stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}
