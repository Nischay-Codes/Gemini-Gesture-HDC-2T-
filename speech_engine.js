/**
 * GeminiGesture: Web Speech API Real-Time Speech Synthesis Engine
 * 
 * Provides an audible voice for non-verbal individuals:
 * - Natural cadence & volume
 * - Intelligent anti-repetition cooldown (prevents stutter if gesture held)
 * - Visual subtitle notification hook
 */

export class SpeechEngine {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.preferredVoice = null;
    this.lastSpokenText = '';
    this.lastSpokenTime = 0;
    this.cooldownMs = 3000; // Do not repeat identical text within 3 seconds
    this.isSpeaking = false;
    this.onSubtitleCallback = null;

    if (this.synth) {
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  initVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    // Prefer high quality English voices (Google US English, Samantha, Daniel, etc.)
    this.preferredVoice = this.voices.find(v => 
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  setSubtitleCallback(cb) {
    this.onSubtitleCallback = cb;
  }

  /**
   * Speak a phrase aloud
   * @param {string} text - The sentence to speak
   * @param {boolean} force - If true, bypass cooldown (e.g. for user-triggered test)
   */
  speak(text, force = false) {
    if (!text || text.trim() === '') return;
    const cleanText = text.trim();
    const now = Date.now();

    // Check anti-repetition cooldown
    if (!force && cleanText.toLowerCase() === this.lastSpokenText.toLowerCase() && (now - this.lastSpokenTime) < this.cooldownMs) {
      return;
    }

    this.lastSpokenText = cleanText;
    this.lastSpokenTime = now;

    if (this.onSubtitleCallback) {
      this.onSubtitleCallback(cleanText);
    }

    if (!this.synth) {
      console.warn('SpeechSynthesis not supported in this browser.');
      return;
    }

    // Cancel ongoing speech for fast responsive interruption
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }
    utterance.rate = 1.05; // Slightly brisk, natural tempo
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.isSpeaking = true;
    };
    utterance.onend = () => {
      this.isSpeaking = false;
    };
    utterance.onerror = (e) => {
      console.warn('TTS playback error:', e);
      this.isSpeaking = false;
    };

    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
  }
}
