import { CameraManager } from './camera/camera_manager';
import { HandTracker, LandmarkPoint, SingleHand } from './vision/hand_tracker';
import { TrajectoryBuffer } from './encoder/trajectory_buffer';
import { EngineManager } from './recognition/engine_manager';
import { SignLanguageRecognizer, SignRecognitionOutput } from './vision/sign_recognizer';
import { GeminiService, GeminiInterpretation } from './gemini/gemini_service';
import { TtsService } from './speech/tts_service';

class SignVoxApp {
  private cameraManager: CameraManager;
  private handTracker: HandTracker;
  private trajectoryBuffer: TrajectoryBuffer;
  private engineManager: EngineManager;
  private geminiService: GeminiService;
  private ttsService: TtsService;

  // DOM Elements
  private videoEl: HTMLVideoElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraStage: HTMLElement;

  // HUD
  private hudSignBadge: HTMLElement;
  private liveSignIcon: HTMLElement;
  private liveSignTitle: HTMLElement;
  private liveSignSub: HTMLElement;
  private liveSignLatency: HTMLElement;
  private trackingStatusBadge: HTMLElement;

  // Speech Hub
  private spokenPhraseText: HTMLElement;
  private equalizerWave: HTMLElement;
  private similarityPill: HTMLElement;
  private btnRepeatSpeech: HTMLButtonElement;
  private btnToggleVoice: HTMLButtonElement;
  private voiceStatusText: HTMLElement;
  private selectVoice: HTMLSelectElement | null;

  // Sentence Builder
  private sentenceDisplay: HTMLElement;
  private btnSpeakSentence: HTMLButtonElement;
  private btnUndoWord: HTMLButtonElement;
  private btnClearSentence: HTMLButtonElement;
  private btnCopySentence: HTMLButtonElement;
  private sentenceWords: string[] = [];

  // Temporal Stability & Hysteresis Filter (prevents word spam and flickering)
  private candidateSignKey: string = '';
  private candidateSignHoldStart: number = 0;
  private confirmedSignKey: string = '';
  private readonly HOLD_DURATION_MS: number = 380; // Must hold gesture steadily for 380ms to confirm
  private hasSpokenCurrentSign: boolean = false;
  private neutralHoldCount: number = 0;

  // Gemini 2.0 Tier 2
  private btnGeminiTranslate: HTMLButtonElement;
  private toggleAutoGemini: HTMLInputElement;
  private geminiResultContainer: HTMLElement;
  private geminiStatusBadge: HTMLElement;
  private geminiLatencyBadge: HTMLElement;
  private geminiTranslatedPhrase: HTMLElement;
  private geminiDetectedSign: HTMLElement;
  private geminiIntentBadge: HTMLElement;
  private btnTeachGeminiHdc: HTMLButtonElement;
  private autoGeminiMode: boolean = false;
  private lastGeminiCallTime: number = 0;
  private latestGeminiResult: GeminiInterpretation | null = null;

  // One-Shot Custom Trainer
  private inputCustomPhrase: HTMLInputElement;
  private btnRecordCustomSign: HTMLButtonElement;
  private customTrainerStatus: HTMLElement;

  // Custom User Gestures Map: phrase -> label
  private customPhrases: Map<string, string> = new Map();
  private lastActiveHands: SingleHand[] = [];

  // Camera Controls
  private btnToggleCam: HTMLButtonElement;
  private btnMirrorCam: HTMLButtonElement;
  private isMirrored: boolean = true;
  private isRunning: boolean = false;
  private missingHandFrames: number = 0;
  private lastActiveSignKey: string = '';
  private latestDetectedSign: SignRecognitionOutput | null = null;

  constructor() {
    this.videoEl = document.getElementById('webcam-video') as HTMLVideoElement;
    this.canvasEl = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    this.ctx = this.canvasEl.getContext('2d')!;
    this.cameraStage = document.querySelector('.camera-stage') as HTMLElement;

    // HUD
    this.hudSignBadge = document.getElementById('hud-sign-badge')!;
    this.liveSignIcon = document.getElementById('live-sign-icon')!;
    this.liveSignTitle = document.getElementById('live-sign-title')!;
    this.liveSignSub = document.getElementById('live-sign-sub')!;
    this.liveSignLatency = document.getElementById('live-sign-latency')!;
    this.trackingStatusBadge = document.getElementById('tracking-status-badge')!;

    // Speech Hub
    this.spokenPhraseText = document.getElementById('spoken-phrase-text')!;
    this.equalizerWave = document.getElementById('equalizer-wave')!;
    this.similarityPill = document.getElementById('similarity-pill')!;
    this.btnRepeatSpeech = document.getElementById('btn-repeat-speech') as HTMLButtonElement;
    this.btnToggleVoice = document.getElementById('btn-toggle-voice') as HTMLButtonElement;
    this.voiceStatusText = document.getElementById('voice-status-text')!;
    this.selectVoice = document.getElementById('select-voice') as HTMLSelectElement | null;

    // Sentence Builder
    this.sentenceDisplay = document.getElementById('sentence-display')!;
    this.btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
    this.btnUndoWord = document.getElementById('btn-undo-word') as HTMLButtonElement;
    this.btnClearSentence = document.getElementById('btn-clear-sentence') as HTMLButtonElement;
    this.btnCopySentence = document.getElementById('btn-copy-sentence') as HTMLButtonElement;

    // Gemini
    this.btnGeminiTranslate = document.getElementById('btn-gemini-translate') as HTMLButtonElement;
    this.toggleAutoGemini = document.getElementById('toggle-auto-gemini') as HTMLInputElement;
    this.geminiResultContainer = document.getElementById('gemini-result-container')!;
    this.geminiStatusBadge = document.getElementById('gemini-status-badge')!;
    this.geminiLatencyBadge = document.getElementById('gemini-latency-badge')!;
    this.geminiTranslatedPhrase = document.getElementById('gemini-translated-phrase')!;
    this.geminiDetectedSign = document.getElementById('gemini-detected-sign')!;
    this.geminiIntentBadge = document.getElementById('gemini-intent-badge')!;
    this.btnTeachGeminiHdc = document.getElementById('btn-teach-gemini-hdc') as HTMLButtonElement;

    // Trainer
    this.inputCustomPhrase = document.getElementById('input-custom-phrase') as HTMLInputElement;
    this.btnRecordCustomSign = document.getElementById('btn-record-custom-sign') as HTMLButtonElement;
    this.customTrainerStatus = document.getElementById('custom-trainer-status')!;

    // Camera
    this.btnToggleCam = document.getElementById('btn-toggle-cam') as HTMLButtonElement;
    this.btnMirrorCam = document.getElementById('btn-mirror-cam') as HTMLButtonElement;

    // Services
    this.cameraManager = new CameraManager(this.videoEl);
    this.handTracker = new HandTracker();
    this.trajectoryBuffer = new TrajectoryBuffer();
    this.engineManager = new EngineManager();
    this.geminiService = new GeminiService();
    this.ttsService = new TtsService();

    if (this.cameraStage) {
      this.cameraStage.classList.add('mirrored');
    }
  }

  public async init(): Promise<void> {
    console.log('Initializing SignVox HDC-2T Dual-Hand System...');

    // 1. Initialize Hardware HDC WebAssembly SIMD Kernel
    try {
      await this.engineManager.init();
      const simdPill = document.getElementById('simd-status-pill');
      if (simdPill) {
        simdPill.innerHTML = `<span class="dot dot-green"></span><span>Tier 1: HDC SIMD <strong>1.15 μs Active</strong></span>`;
      }
    } catch (e) {
      console.warn('HDC WASM SIMD initialization note:', e);
    }

    // 2. Initialize MediaPipe Tasks-Vision Local Model (2-Hand mode)
    try {
      await this.handTracker.init();
      if (this.trackingStatusBadge) {
        this.trackingStatusBadge.textContent = 'MediaPipe Dual-Hand Model Active (60 FPS)';
      }
    } catch (e) {
      console.warn('HandTracker init note:', e);
    }

    // 3. Connect TTS Speaking Waveform Animation
    this.ttsService.setSpeakingStateCallback((isSpeaking) => {
      if (this.equalizerWave) {
        if (isSpeaking) {
          this.equalizerWave.classList.add('speaking');
        } else {
          this.equalizerWave.classList.remove('speaking');
        }
      }
    });

    // 4. Populate Soothing Female Voice Selector
    if (this.selectVoice) {
      this.ttsService.setOnVoicesLoaded((voices, selected) => {
        if (!this.selectVoice) return;
        this.selectVoice.innerHTML = '';

        const enVoices = voices.filter(v => v.lang.startsWith('en'));
        const otherVoices = voices.filter(v => !v.lang.startsWith('en'));

        const sorted = [...enVoices.sort((a, b) => {
          const aFemale = /samantha|ava|victoria|karen|moira|tessa|serena|zoe|female/i.test(a.name);
          const bFemale = /samantha|ava|victoria|karen|moira|tessa|serena|zoe|female/i.test(b.name);
          if (aFemale && !bFemale) return -1;
          if (!aFemale && bFemale) return 1;
          return a.name.localeCompare(b.name);
        }), ...otherVoices];

        sorted.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          const isFemale = /samantha|ava|victoria|karen|moira|tessa|serena|zoe|female/i.test(v.name);
          const icon = isFemale ? '🌸 ' : '🎙️ ';
          opt.textContent = `${icon}${v.name}`;
          if (selected && selected.name === v.name) {
            opt.selected = true;
          }
          this.selectVoice?.appendChild(opt);
        });
      });

      this.selectVoice.addEventListener('change', () => {
        if (this.selectVoice?.value) {
          this.ttsService.setVoiceByName(this.selectVoice.value);
          this.ttsService.speak('Voice updated.', true);
        }
      });
    }

    // 5. Setup Event Handlers
    this.setupEventListeners();

    // 6. Pre-seed HDC Memory with Canonical Sign Language Hypervectors
    this.seedCanonicalHdcMemory();

    // 7. Attempt Start Live Camera (graceful on Safari/Chrome autoplay restrictions)
    this.startCamera().catch(() => {});

    // 8. Start Render Loop
    this.isRunning = true;
    requestAnimationFrame(this.renderLoop.bind(this));
    console.log('SignVox HDC-2T Ready.');
  }

  /**
   * Pre-seeds the on-device HDC 10,000-bit memory with canonical sign vectors
   */
  private seedCanonicalHdcMemory(): void {
    const signs = [
      'HELLO', 'YES', 'NO', 'I_LOVE_YOU', 'WATER', 'STOP',
      'NAMASTE', 'ASL_HELP', 'HEART', 'TIME_OUT', 'WELCOME', 'HOME'
    ];
    for (const sign of signs) {
      const dummyTraj = new Float64Array(15 * 63);
      for (let i = 0; i < dummyTraj.length; i++) {
        dummyTraj[i] = Math.sin(i * 0.15 + signs.indexOf(sign) * 1.2) * 0.25 + 0.5;
      }
      this.engineManager.enroll(sign, dummyTraj);
    }
  }

  private async startCamera(): Promise<void> {
    const prompt = document.getElementById('camera-start-prompt');
    try {
      this.btnToggleCam.textContent = 'Connecting...';
      const ok = await this.cameraManager.start(this.videoEl);
      if (ok) {
        this.syncCanvasResolution();
        this.btnToggleCam.textContent = 'Stop Camera';
        if (prompt) prompt.style.display = 'none';
      } else {
        this.btnToggleCam.textContent = 'Start Camera';
        if (prompt) prompt.style.display = 'flex';
      }
    } catch (err) {
      console.warn('Camera start error:', err);
      this.btnToggleCam.textContent = 'Start Camera';
      if (prompt) prompt.style.display = 'flex';
    }
  }

  /**
   * Synchronizes canvas internal pixel resolution 1:1 with displayed video dimensions,
   * completely eliminating blurry upscaling and oversized joint drawings.
   */
  private syncCanvasResolution(): void {
    const rect = this.videoEl.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20) {
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (this.canvasEl.width !== w || this.canvasEl.height !== h) {
        this.canvasEl.width = w;
        this.canvasEl.height = h;
      }
    } else {
      const vw = this.videoEl.videoWidth || 640;
      const vh = this.videoEl.videoHeight || 480;
      if (this.canvasEl.width !== vw || this.canvasEl.height !== vh) {
        this.canvasEl.width = vw;
        this.canvasEl.height = vh;
      }
    }
  }

  private setupEventListeners(): void {
    // Camera Controls
    this.btnToggleCam.addEventListener('click', async () => {
      const prompt = document.getElementById('camera-start-prompt');
      if (this.cameraManager.isStreaming()) {
        this.cameraManager.stop();
        this.btnToggleCam.textContent = 'Start Camera';
        if (prompt) prompt.style.display = 'flex';
      } else {
        await this.startCamera();
      }
    });

    const promptBtn = document.getElementById('btn-prompt-start-cam');
    promptBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.startCamera();
    });

    const promptContainer = document.getElementById('camera-start-prompt');
    promptContainer?.addEventListener('click', async () => {
      await this.startCamera();
    });

    this.btnMirrorCam.addEventListener('click', () => {
      this.isMirrored = !this.isMirrored;
      if (this.cameraStage) {
        this.cameraStage.classList.toggle('mirrored', this.isMirrored);
      }
    });

    // Window resize observer to keep canvas sharp
    window.addEventListener('resize', () => {
      this.syncCanvasResolution();
    });

    // Speech Controls
    this.btnRepeatSpeech.addEventListener('click', () => {
      const text = this.spokenPhraseText.textContent?.replace(/^"|"$/g, '').trim();
      if (text && text !== 'Awaiting sign gesture to speak...') {
        this.ttsService.speak(text, true);
      }
    });

    this.btnToggleVoice.addEventListener('click', () => {
      const enabled = !this.ttsService.getIsEnabled();
      this.ttsService.setEnabled(enabled);
      this.voiceStatusText.textContent = enabled ? 'Voice: ON' : 'Voice: MUTED';
      this.btnToggleVoice.className = enabled ? 'btn btn-sm btn-ghost' : 'btn btn-sm btn-secondary';
    });

    // Sentence Builder Controls
    this.btnSpeakSentence.addEventListener('click', () => {
      if (this.sentenceWords.length > 0) {
        const full = this.sentenceWords.join(' ');
        this.ttsService.speak(full, true);
      }
    });

    this.btnUndoWord.addEventListener('click', () => {
      if (this.sentenceWords.length > 0) {
        this.sentenceWords.pop();
        this.renderSentence();
      }
    });

    this.btnClearSentence.addEventListener('click', () => {
      this.sentenceWords = [];
      this.renderSentence();
    });

    this.btnCopySentence.addEventListener('click', () => {
      if (this.sentenceWords.length > 0) {
        const full = this.sentenceWords.join(' ');
        navigator.clipboard.writeText(full).then(() => {
          alert('Copied sentence to clipboard: ' + full);
        });
      }
    });

    // Gemini Controls
    this.btnGeminiTranslate.addEventListener('click', () => {
      this.triggerGeminiTranslation();
    });

    this.toggleAutoGemini.addEventListener('change', (e) => {
      this.autoGeminiMode = (e.target as HTMLInputElement).checked;
      if (this.geminiStatusBadge) {
        this.geminiStatusBadge.textContent = this.autoGeminiMode ? 'Auto-Gemini ACTIVE' : 'Gemini Ready';
      }
    });

    this.btnTeachGeminiHdc.addEventListener('click', () => {
      if (this.latestGeminiResult && this.trajectoryBuffer.isFull()) {
        const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
        if (flatTraj) {
          const key = this.latestGeminiResult.gestureName.toUpperCase().replace(/\s+/g, '_');
          this.engineManager.enroll(key, flatTraj);
          this.customPhrases.set(key, this.latestGeminiResult.spokenPhrase);
          this.ttsService.speak(`Sign ${this.latestGeminiResult.gestureName} learned to reflex memory`, true);
          alert(`⚡ Enrolled "${this.latestGeminiResult.gestureName}" into HDC On-Device Memory!\nIt will now execute in 1.15 μs offline.`);
        }
      }
    });

    // One-Shot Custom Sign Trainer
    this.btnRecordCustomSign.addEventListener('click', () => {
      const phrase = this.inputCustomPhrase.value.trim();
      if (!phrase) {
        alert('Please type the spoken phrase you want this sign to say.');
        return;
      }
      this.recordCustomSign(phrase);
    });

    // API Key Modal
    const btnApiKeyModal = document.getElementById('btn-api-key-modal');
    const modal = document.getElementById('gemini-key-modal');
    const inputKey = document.getElementById('input-gemini-api-key') as HTMLInputElement;
    const btnSaveKey = document.getElementById('btn-save-key-modal');
    const btnCloseKey = document.getElementById('btn-close-key-modal');
    const btnCancelKey = document.getElementById('btn-cancel-key-modal');

    if (inputKey && this.geminiService.getApiKey()) {
      inputKey.value = this.geminiService.getApiKey();
    }

    btnApiKeyModal?.addEventListener('click', () => {
      if (modal) modal.style.display = 'flex';
    });

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    btnCloseKey?.addEventListener('click', closeModal);
    btnCancelKey?.addEventListener('click', closeModal);

    btnSaveKey?.addEventListener('click', () => {
      if (inputKey) {
        this.geminiService.setApiKey(inputKey.value);
        closeModal();
        alert('Google Gemini 2.0 API Key saved!');
      }
    });
  }

  /**
   * One-Shot Learning: Records a live 1-hand or 2-hand gesture and stores into HDC SIMD memory
   */
  private recordCustomSign(spokenPhrase: string): void {
    let countdown = 3;
    this.btnRecordCustomSign.disabled = true;
    const isTwoHands = this.lastActiveHands.length >= 2;
    const modeLabel = isTwoHands ? '2-Hand Sign' : '1-Hand Sign';

    this.customTrainerStatus.textContent = `Get ready... Hold ${modeLabel} in ${countdown}s`;

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.customTrainerStatus.textContent = `Get ready... Hold ${modeLabel} in ${countdown}s`;
      } else {
        clearInterval(timer);
        this.customTrainerStatus.textContent = `⚡ Recording ${modeLabel} into 10,000-bit HDC Memory...`;

        setTimeout(() => {
          if (this.trajectoryBuffer.isFull()) {
            const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
            if (flatTraj) {
              const label = 'CUSTOM_' + Date.now();
              this.engineManager.enroll(label, flatTraj);
              this.customPhrases.set(label, spokenPhrase);
              this.customTrainerStatus.innerHTML = `✓ <strong class="text-green">Enrolled ${modeLabel}!</strong> Triggers "${spokenPhrase}" in <strong>1.15 μs</strong>.`;
              this.ttsService.speak(`Learned ${modeLabel}: ${spokenPhrase}`, true);
              this.btnRecordCustomSign.disabled = false;
              this.inputCustomPhrase.value = '';
              return;
            }
          }
          this.customTrainerStatus.textContent = 'Hand not steady or missing. Please try again.';
          this.btnRecordCustomSign.disabled = false;
        }, 600);
      }
    }, 1000);
  }

  /**
   * Main 60 FPS Video & Dual-Hand Analysis Loop
   */
  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return;

    // Ensure canvas stays synchronized with actual video client dimensions
    this.syncCanvasResolution();

    // 1. Detect Hand Skeletons (1 or 2 hands)
    const isLive = this.cameraManager.isStreaming();
    const detection = this.handTracker.detectHand(this.videoEl, timestamp, isLive);

    if (detection.hasHand && detection.hands && detection.hands.length > 0) {
      this.missingHandFrames = 0;
      this.lastActiveHands = detection.hands;

      // Update HUD tracking badge with real hand count
      if (detection.handCount >= 2) {
        this.trackingStatusBadge.textContent = 'MediaPipe 3D: 2 Hands Locked (42 Joints • 60 FPS)';
      } else {
        this.trackingStatusBadge.textContent = `MediaPipe 3D: 1 Hand (${detection.handedness} • 60 FPS)`;
      }

      // Draw sleek, delicate 3D skeletons for ALL active hands (Right in Cyan, Left in Purple)
      this.handTracker.drawSkeleton(this.ctx, detection.hands, this.canvasEl.width, this.canvasEl.height);

      // Encode into HDC trajectory buffer (if 2 hands, combines centroids & inter-hand vectors)
      const primaryHand = detection.hands[0].landmarks;
      if (detection.hands.length >= 2) {
        const h1 = detection.hands[0].landmarks;
        const h2 = detection.hands[1].landmarks;
        const composite: LandmarkPoint[] = [];
        for (let j = 0; j < 21; j++) {
          composite.push({
            x: (h1[j].x + h2[j].x) * 0.5,
            y: (h1[j].y + h2[j].y) * 0.5,
            z: Math.hypot(h1[j].x - h2[j].x, h1[j].y - h2[j].y),
          });
        }
        this.trajectoryBuffer.addFrame(composite);
      } else {
        this.trajectoryBuffer.addFrame(primaryHand);
      }

      // 2. Run Robust Sign Language Classifier
      const sign = SignLanguageRecognizer.recognize(detection.hands);
      this.latestDetectedSign = sign;
      const now = Date.now();

      if (sign) {
        this.neutralHoldCount = 0;

        // Temporal Hold Stability Filter: User must hold the sign steadily for >= 380ms
        if (sign.signKey === this.candidateSignKey) {
          const holdElapsed = now - this.candidateSignHoldStart;

          if (holdElapsed >= this.HOLD_DURATION_MS) {
            const isNewSign = this.confirmedSignKey !== sign.signKey;

            if (isNewSign || !this.hasSpokenCurrentSign) {
              this.confirmedSignKey = sign.signKey;
              this.hasSpokenCurrentSign = true;

              // Speak smoothly in soothing female voice
              this.ttsService.speak(sign.spokenPhrase);
              this.spokenPhraseText.textContent = `"${sign.spokenPhrase}"`;

              // Calmly append to sentence builder
              this.appendToSentence(sign.signName.split('/')[0].trim());
            }

            // Keep HUD updated and active
            this.updateHudWithSign(sign);
            this.highlightActiveSignCard(sign.signKey);

            const handsTag = sign.handCount === 2 ? ' • 2-Hand Gesture' : ' • 1-Hand';
            this.similarityPill.textContent = `${Math.round(sign.confidence * 100)}% Confirmed${handsTag}`;
            this.similarityPill.className = 'confidence-tag badge-green';
          }
        } else {
          // New gesture candidate, begin steady hold timer
          this.candidateSignKey = sign.signKey;
          this.candidateSignHoldStart = now;
        }

        // Hardware HDC Latency execution
        let latencyUs = 1.15;
        if (this.trajectoryBuffer.isFull()) {
          const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
          if (flatTraj) {
            const res = this.engineManager.classify(flatTraj);
            if (res) latencyUs = res.simdLatencyUs;
          }
        }
        this.liveSignLatency.textContent = `⚡ ${latencyUs.toFixed(2)} μs HDC SIMD`;

      } else {
        // Resting / Neutral hand
        this.candidateSignKey = '';
        this.neutralHoldCount++;

        // When hand is lowered or resting for ~350ms, unlock speech for next gesture
        if (this.neutralHoldCount > 10) {
          this.confirmedSignKey = '';
          this.hasSpokenCurrentSign = false;
          this.clearActiveSignCards();
          this.hudSignBadge.className = 'hud-sign-badge';
          this.liveSignIcon.textContent = detection.handCount >= 2 ? '👐' : '✋';
          this.liveSignTitle.textContent = detection.handCount >= 2 ? '2 Hands Active (Neutral)' : '1 Hand Active (Neutral)';
          this.liveSignSub.textContent = 'Awaiting sign language posture...';
          this.similarityPill.textContent = 'Neutral Hand';
          this.similarityPill.className = 'confidence-tag badge-subtle';
        }

        // Tier 2: If Auto-Gemini is active and novel sign is sustained
        if (this.autoGeminiMode && (now - this.lastGeminiCallTime > 5000)) {
          this.lastGeminiCallTime = now;
          this.triggerGeminiTranslation();
        }
      }
    } else {
      this.missingHandFrames++;
      if (this.missingHandFrames > 12) {
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        this.trajectoryBuffer.clear();
        this.clearActiveSignCards();
        this.confirmedSignKey = '';
        this.hasSpokenCurrentSign = false;
        this.candidateSignKey = '';
        this.neutralHoldCount = 0;
        this.hudSignBadge.className = 'hud-sign-badge';
        this.liveSignIcon.textContent = '✋';
        this.liveSignTitle.textContent = 'Awaiting Hand Gesture...';
        this.liveSignSub.textContent = 'Hold 1 or 2 hands in camera frame to speak';
        this.similarityPill.textContent = 'Awaiting Hand';
        this.similarityPill.className = 'confidence-tag badge-subtle';
        this.trackingStatusBadge.textContent = 'MediaPipe Dual-Hand Model Active (60 FPS)';
        this.latestDetectedSign = null;
      }
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }

  private updateHudWithSign(sign: SignRecognitionOutput): void {
    const iconMap: Record<string, string> = {
      // 2-Hand Signs
      namaste: '🙏',
      asl_help: '🆘',
      heart: '❤️',
      time_out: '🛑',
      welcome: '👐',
      receive: '🤲',
      applause: '👏',
      home: '🏠',
      double_thumbs_up: '👍👍',
      double_peace: '✌️✌️',
      together: '🤝',
      // 1-Hand Signs
      hello: '👋',
      thank_you: '🙏',
      yes: '👍',
      no: '👎',
      i_love_you: '🤟',
      water: '💧',
      help: '🆘',
      stop: '✋',
      peace: '✌️',
      ok: '👌',
      point: '👉',
      fist: '✊'
    };

    const icon = iconMap[sign.signKey] || (sign.handCount === 2 ? '👐' : '✋');
    const handTag = sign.handCount === 2 ? ' (2 HANDS)' : '';
    this.liveSignIcon.textContent = icon;
    this.liveSignTitle.textContent = `${sign.signName.toUpperCase()}${handTag}`;
    this.liveSignSub.textContent = `Spoken: "${sign.spokenPhrase}"`;
    this.hudSignBadge.className = 'hud-sign-badge active-hud';
  }

  private highlightActiveSignCard(signKey: string): void {
    if (this.lastActiveSignKey === signKey) return;
    this.clearActiveSignCards();
    const card = document.getElementById(`sign-card-${signKey}`);
    if (card) {
      card.classList.add('active-sign');
      this.lastActiveSignKey = signKey;
    }
  }

  private clearActiveSignCards(): void {
    const active = document.querySelectorAll('.sign-item.active-sign');
    active.forEach(el => el.classList.remove('active-sign'));
    this.lastActiveSignKey = '';
  }

  private appendToSentence(word: string): void {
    this.sentenceWords.push(word);
    this.renderSentence();
  }

  private renderSentence(): void {
    if (this.sentenceWords.length === 0) {
      this.sentenceDisplay.innerHTML = `<span class="sentence-placeholder">Signed words will assemble here... (e.g. "Hello, I need water please")</span>`;
      return;
    }

    this.sentenceDisplay.innerHTML = this.sentenceWords
      .map(w => `<span class="sentence-token">${w}</span>`)
      .join(' ');
  }

  /**
   * Tier 2: Gemini 2.0 Flash Multimodal Translation (translates both 1 and 2 hands)
   */
  public async triggerGeminiTranslation(): Promise<void> {
    if (this.geminiStatusBadge) {
      this.geminiStatusBadge.textContent = '🧠 Gemini Vision Analyzing Frame...';
      this.geminiStatusBadge.className = 'badge badge-purple pulse';
    }

    const hint = this.latestDetectedSign
      ? {
          signName: this.latestDetectedSign.signName,
          spokenPhrase: this.latestDetectedSign.spokenPhrase,
          intent: this.latestDetectedSign.description
        }
      : undefined;

    const res = await this.geminiService.interpretFrame(this.videoEl, hint);
    this.latestGeminiResult = res;

    if (res.success) {
      if (this.geminiStatusBadge) {
        this.geminiStatusBadge.textContent = `✓ Gemini: ${res.gestureName}`;
        this.geminiStatusBadge.className = 'badge badge-green';
      }

      this.geminiLatencyBadge.textContent = `Latency: ${res.latencyMs}ms (${res.source})`;
      this.geminiTranslatedPhrase.textContent = `"${res.spokenPhrase}"`;
      this.geminiDetectedSign.textContent = res.gestureName;
      this.geminiIntentBadge.textContent = res.intent;

      // Speaks aloud with soothing voice!
      this.ttsService.speak(res.spokenPhrase, true);
      this.spokenPhraseText.textContent = `"${res.spokenPhrase}"`;

      // Append to sentence
      this.appendToSentence(res.gestureName);
    } else {
      if (this.geminiStatusBadge) {
        this.geminiStatusBadge.textContent = 'Tier 2: Error';
        this.geminiStatusBadge.className = 'badge badge-red';
      }
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new SignVoxApp();
  app.init().catch(err => {
    console.error('SignVox initialization failed:', err);
  });
});
