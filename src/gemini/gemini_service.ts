/**
 * Google Gemini 2.0 Flash Multimodal Vision Service
 * 
 * Direct Real-Time Assistive Communication Engine:
 * - Analyzes video frames of live hand signs and complex 2-handed gestures using Google Gemini
 * - Formulates fluent, natural, empathetic first-person speech for non-verbal communicators
 * - Structured JSON output used to continuously seed the on-device HDC 10,000-bit SIMD memory
 */

export interface GeminiInterpretation {
  success: boolean;
  gestureName: string;
  spokenPhrase: string;
  intent: string;
  confidence: number;
  latencyMs: number;
  source: 'gemini-2.0-flash' | 'gemini-1.5-flash' | 'none';
  error?: string;
}

export class GeminiService {
  private apiKey: string = '';
  private activeModel: string = 'gemini-2.0-flash';
  private isProcessing: boolean = false;
  private lastInterpretation: GeminiInterpretation | null = null;
  private onStatusChange: ((status: string, isBusy: boolean) => void) | null = null;

  constructor() {
    this.initKey();
  }

  private async initKey(): Promise<void> {
    // 1. Check URL parameters (?apiKey=... or ?key=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('apiKey') || urlParams.get('key');
      if (urlKey && urlKey.trim().length > 10) {
        this.setApiKey(urlKey.trim());
        return;
      }
    } catch {
      // Ignore URL parsing errors
    }

    // 2. Check localStorage
    const local = localStorage.getItem('GEMINI_API_KEY');
    if (local && local.trim().length > 10) {
      this.apiKey = local.trim();
      return;
    }

    // 3. Check server .env / config
    try {
      const res = await fetch('/api/key');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey && data.apiKey.trim().length > 10) {
          this.apiKey = data.apiKey.trim();
          localStorage.setItem('GEMINI_API_KEY', this.apiKey);
        }
      }
    } catch {
      // Server fetch optional
    }
  }

  public setOnStatusChange(cb: (status: string, isBusy: boolean) => void): void {
    this.onStatusChange = cb;
  }

  public setApiKey(key: string): void {
    this.apiKey = (key || '').trim();
    if (this.apiKey) {
      localStorage.setItem('GEMINI_API_KEY', this.apiKey);
      // Persist to server if available
      fetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: this.apiKey })
      }).catch(() => {});
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }

  /**
   * Test API Key connection directly with Google Generative AI
   */
  public async testConnection(keyToTest?: string): Promise<{ success: boolean; model: string; message: string; latencyMs: number }> {
    const key = (keyToTest || this.apiKey).trim();
    if (!key) {
      return { success: false, model: '', message: 'API key is empty', latencyMs: 0 };
    }

    const t0 = performance.now();
    let modelToUse = 'gemini-2.0-flash';

    try {
      let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;
      let res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with the single word: READY' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      });

      if (!res.ok && res.status === 404) {
        // Fallback to gemini-1.5-flash
        modelToUse = 'gemini-1.5-flash';
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with the single word: READY' }] }],
            generationConfig: { maxOutputTokens: 5 }
          })
        });
      }

      const latencyMs = Math.round(performance.now() - t0);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${res.status}`;
        return { success: false, model: modelToUse, message: errMsg, latencyMs };
      }

      this.apiKey = key;
      this.activeModel = modelToUse;
      localStorage.setItem('GEMINI_API_KEY', key);

      return {
        success: true,
        model: modelToUse,
        message: `Successfully connected to ${modelToUse} (${latencyMs}ms)`,
        latencyMs
      };
    } catch (err: any) {
      return { success: false, model: modelToUse, message: err.message || 'Network error', latencyMs: 0 };
    }
  }

  /**
   * Captures a base64 JPEG frame from a video or canvas element
   */
  public captureFrameBase64(source: HTMLVideoElement | HTMLCanvasElement, quality = 0.85): string {
    let canvas: HTMLCanvasElement;
    if (source instanceof HTMLCanvasElement) {
      canvas = source;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = source.videoWidth || 640;
      canvas.height = source.videoHeight || 480;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1];
  }

  /**
   * Send live camera frame directly to Google Gemini Multimodal Vision API
   * Interprets any sign language gesture (1 or 2 hands) without hardcoded dictionary!
   */
  public async interpretFrame(
    source: HTMLVideoElement | HTMLCanvasElement,
    handContext?: { handCount: number; handedness?: string }
  ): Promise<GeminiInterpretation> {
    if (this.isProcessing) {
      return {
        success: false,
        gestureName: 'Processing',
        spokenPhrase: '',
        intent: 'Busy',
        confidence: 0,
        latencyMs: 0,
        source: this.activeModel as any,
        error: 'Concurrent call blocked'
      };
    }

    if (!this.hasApiKey()) {
      if (this.onStatusChange) this.onStatusChange('API Key Required (Paste Gemini Key in Header)', false);
      return {
        success: false,
        gestureName: 'No API Key',
        spokenPhrase: 'Please set your Google Gemini API key to translate gestures.',
        intent: 'Configuration Required',
        confidence: 0,
        latencyMs: 0,
        source: 'none',
        error: 'NO_API_KEY'
      };
    }

    this.isProcessing = true;
    if (this.onStatusChange) this.onStatusChange(`Google Gemini Analyzing Gesture (${handContext?.handCount || 1} Hands)...`, true);
    const t0 = performance.now();

    try {
      const base64Data = this.captureFrameBase64(source);

      const prompt = `You are the core assistive communication voice for a non-verbal person communicating through sign language and hand gestures in front of the camera.
You are seeing their live camera view.
Active hands detected: ${handContext?.handCount || 1} (${handContext?.handedness || 'in view'}).

Your instructions:
1. Examine the user's hand shape, finger extensions, palm orientations, and relative positions of BOTH hands (if 2 hands are used).
2. Recognize what sign language (ASL, ISL, BSL), universal non-verbal gesture, or expressive physical action they are showing.
3. Understand what the person is actively communicating.
4. Formulate the EXACT first-person natural, concise, polite spoken sentence (under 12 words) to be voiced aloud on their speaker (e.g. "I need a glass of water please", "Thank you very much", "Where is the bathroom?", "I am happy to meet you", "Please help me with this", "Yes, I agree", "I love you", "Stop please").

Respond ONLY with a valid, clean JSON object (no markdown, no backticks, no comments):
{
  "gesture_name": "Short descriptive gesture name (e.g. Asking for Water, ASL Help, Namaste, Thank You, Pointing to Exit, Heart, Fist)",
  "spoken_phrase": "First-person natural sentence to be spoken out loud (e.g. 'I need some water please.')",
  "intent": "Communicative intent (e.g. Basic Need, Greeting, Assistance, Gratitude, Emotion, Directive)",
  "confidence": 0.95
}`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 200,
          responseMimeType: 'application/json'
        }
      };

      let modelInUse = this.activeModel || 'gemini-2.0-flash';
      let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelInUse}:generateContent?key=${this.apiKey}`;

      let response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok && response.status === 404 && modelInUse === 'gemini-2.0-flash') {
        modelInUse = 'gemini-1.5-flash';
        this.activeModel = modelInUse;
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelInUse}:generateContent?key=${this.apiKey}`;
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      let parsed: any;
      try {
        parsed = JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim());
      } catch {
        parsed = {
          gesture_name: "Gesture Recognized",
          spoken_phrase: rawText.slice(0, 80).trim(),
          intent: "Communication",
          confidence: 0.85
        };
      }

      const t1 = performance.now();
      const result: GeminiInterpretation = {
        success: true,
        gestureName: parsed.gesture_name || "Sign Identified",
        spokenPhrase: parsed.spoken_phrase || "I want to communicate with you.",
        intent: parsed.intent || "Assistive Communication",
        confidence: parsed.confidence || 0.95,
        latencyMs: Math.round(t1 - t0),
        source: modelInUse as any
      };

      this.lastInterpretation = result;
      if (this.onStatusChange) this.onStatusChange(`Gemini Decoded: "${result.spokenPhrase}" (${result.latencyMs}ms)`, false);
      return result;

    } catch (err: any) {
      console.warn('Gemini API call failed:', err);
      const errMsg = err.message || 'Gemini error';
      if (this.onStatusChange) this.onStatusChange(`Gemini Error: ${errMsg}`, false);
      return {
        success: false,
        gestureName: 'Recognition Error',
        spokenPhrase: '',
        intent: 'Error',
        confidence: 0,
        latencyMs: Math.round(performance.now() - t0),
        source: this.activeModel as any,
        error: errMsg
      };
    } finally {
      this.isProcessing = false;
    }
  }
}
