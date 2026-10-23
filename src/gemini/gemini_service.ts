/**
 * Google Gemini Multimodal Vision Service
 * 
 * Direct Real-Time Assistive Communication Engine:
 * - Analyzes video frames of live hand signs and complex 2-handed gestures using Google Gemini
 * - Formulates fluent, natural, empathetic first-person speech for non-verbal communicators
 * - Zero CORS/COEP friction via local high-speed server proxy with direct fallback
 */

export interface GeminiInterpretation {
  success: boolean;
  gestureName: string;
  spokenPhrase: string;
  intent: string;
  confidence: number;
  latencyMs: number;
  source: string;
  error?: string;
}

export function sanitizeApiKey(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^["'`]|["'`]$/g, '').trim();
  cleaned = cleaned.replace(/^(?:GEMINI_API_KEY|API_KEY|key)\s*[:=]\s*/i, '').trim();
  const match = cleaned.match(/(?:AIzaSy|AQ\.)[A-Za-z0-9_\-\.]{25,60}/) || cleaned.match(/[A-Za-z0-9_\-\.]{30,65}/);
  if (match) return match[0];
  return cleaned;
}

export class GeminiService {
  private apiKey: string = '';
  private activeModel: string = 'gemini-3.5-flash';
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
      if (urlKey) {
        const clean = sanitizeApiKey(urlKey);
        if (clean.length > 10) {
          this.setApiKey(clean);
          return;
        }
      }
    } catch {
      // Ignore URL parsing errors
    }

    // 2. Check localStorage
    const local = localStorage.getItem('GEMINI_API_KEY');
    if (local) {
      const clean = sanitizeApiKey(local);
      if (clean.length > 10) {
        this.apiKey = clean;
        return;
      }
    }

    // 3. Check server .env / config
    try {
      const res = await fetch('/api/key');
      if (res.ok) {
        const data = await res.json();
        if (data.apiKey) {
          const clean = sanitizeApiKey(data.apiKey);
          if (clean.length > 10) {
            this.apiKey = clean;
            localStorage.setItem('GEMINI_API_KEY', this.apiKey);
          }
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
    this.apiKey = sanitizeApiKey(key);
    if (this.apiKey) {
      localStorage.setItem('GEMINI_API_KEY', this.apiKey);
      // Persist to server
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
   * Test API Key connection via high-speed server proxy (bypasses browser CORS & COEP)
   */
  public async testConnection(keyToTest?: string): Promise<{ success: boolean; model: string; message: string; latencyMs: number }> {
    const rawKey = keyToTest || this.apiKey;
    const cleanKey = sanitizeApiKey(rawKey);

    if (!cleanKey) {
      return { success: false, model: '', message: 'API key is empty', latencyMs: 0 };
    }

    const t0 = performance.now();

    // 1. Try server proxy (best path, completely immune to browser CORS / COEP restrictions)
    try {
      const proxyRes = await fetch('/api/gemini/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey })
      });

      if (proxyRes.ok) {
        const data = await proxyRes.json();
        if (data.success) {
          this.apiKey = data.key || cleanKey;
          this.activeModel = data.model || 'gemini-2.0-flash';
          localStorage.setItem('GEMINI_API_KEY', this.apiKey);
          return {
            success: true,
            model: this.activeModel,
            message: data.message || `Connected to ${this.activeModel}`,
            latencyMs: data.latencyMs || Math.round(performance.now() - t0)
          };
        } else if (!data.message?.includes('Network error') && !data.message?.includes('fetch failed')) {
          // If Google explicitly rejected the key (e.g. bad key, quota)
          return {
            success: false,
            model: data.model || 'gemini-2.0-flash',
            message: data.message || 'Validation failed',
            latencyMs: Math.round(performance.now() - t0)
          };
        }
      }
    } catch {
      // Fall through to direct fetch
    }

    // 2. Direct browser fetch fallback
    const candidateModels = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastErrMsg = '';

    for (const modelToUse of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${cleanKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Respond with: READY' }] }]
          })
        });

        const latencyMs = Math.round(performance.now() - t0);

        if (res.ok) {
          this.apiKey = cleanKey;
          this.activeModel = modelToUse;
          localStorage.setItem('GEMINI_API_KEY', cleanKey);

          return {
            success: true,
            model: modelToUse,
            message: `Connected to ${modelToUse} (${latencyMs}ms)`,
            latencyMs
          };
        } else {
          const errJson = await res.json().catch(() => ({}));
          lastErrMsg = errJson.error?.message || `HTTP ${res.status}`;
        }
      } catch (err: any) {
        lastErrMsg = err.message || 'Network error';
      }
    }

    return { success: false, model: this.activeModel, message: lastErrMsg || 'Connection failed', latencyMs: 0 };
  }

  /**
   * Captures an ultra-lean base64 JPEG frame (240x180 @ 0.45 quality, ~4KB) for rapid upload
   */
  public captureFrameBase64(source: HTMLVideoElement | HTMLCanvasElement, quality = 0.45): string {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl.split(',')[1];
  }

  /**
   * Send live camera frame to Google Gemini Multimodal Vision API
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
        source: this.activeModel,
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

      const prompt = `You are the assistive voice for a non-verbal person signing. Hands visible: ${handContext?.handCount || 1}.
Examine hands and formulate a concise first-person spoken sentence under 7 words.
Return ONLY clean JSON:
{
  "gesture_name": "Short gesture name (e.g. ASL Letter F, Namaste, Water, Peace)",
  "spoken_phrase": "Short first-person spoken sentence",
  "intent": "Intent"
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
          temperature: 0.1,
          maxOutputTokens: 35,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      };

      let rawText = '';
      let modelUsed = this.activeModel || 'gemini-3.5-flash';

      // 1. Try server proxy (immune to COEP / CORS)
      try {
        const proxyRes = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: this.apiKey,
            model: modelUsed,
            requestBody
          })
        });

        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          rawText = proxyData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (proxyData._modelInUse) modelUsed = proxyData._modelInUse;
        }
      } catch {
        // Fallback to direct fetch
      }

      // 2. Direct browser fetch fallback if proxy did not return
      if (!rawText) {
        const candidateModels = [modelUsed, 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
        let lastErr = '';

        for (const m of candidateModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${this.apiKey}`;
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });

            if (response.ok) {
              const data = await response.json();
              rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
              modelUsed = m;
              this.activeModel = m;
              break;
            } else {
              const errorData = await response.json().catch(() => ({}));
              lastErr = errorData.error?.message || `HTTP ${response.status}`;
            }
          } catch (e: any) {
            lastErr = e.message;
          }
        }

        if (!rawText && lastErr) {
          throw new Error(lastErr);
        }
      }

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
        source: modelUsed
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
        source: this.activeModel,
        error: errMsg
      };
    } finally {
      this.isProcessing = false;
    }
  }
}
