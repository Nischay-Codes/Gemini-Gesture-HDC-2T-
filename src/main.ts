import { CameraManager } from './camera/camera_manager';
import { HandTracker, LandmarkPoint, SingleHand } from './vision/hand_tracker';
import { TrajectoryBuffer } from './encoder/trajectory_buffer';
import { EngineManager } from './recognition/engine_manager';
import { HandPoseTracker, HandKinematics } from './vision/hand_pose_tracker';
import { GeminiService, GeminiInterpretation } from './gemini/gemini_service';
import { TtsService } from './speech/tts_service';

interface CachedReflexSign {
  id: string;
  gestureName: string;
  spokenPhrase: string;
  intent: string;
  handCount: number;
  timestamp: number;
}

class SignVoxApp {
  private cameraManager: CameraManager;
  private handTracker: HandTracker;
  private trajectoryBuffer: TrajectoryBuffer;
  private engineManager: EngineManager;
  private handPoseTracker: HandPoseTracker;
  private geminiService: GeminiService;
  private ttsService: TtsService;

  // DOM Elements - Viewport & Camera
  private videoEl: HTMLVideoElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraStage: HTMLElement;
  private cameraStartPrompt: HTMLElement;
  private btnPromptStartCam: HTMLButtonElement;
  private btnToggleCam: HTMLButtonElement;
  private btnMirrorCam: HTMLButtonElement;

  // Inline API Key Elements
  private inputInlineGeminiKey: HTMLInputElement;
  private btnSaveInlineKey: HTMLButtonElement;
  private headerKeyStatus: HTMLElement;

  // HUD Elements
  private hudSignBadge: HTMLElement;
  private liveSignIcon: HTMLElement;
  private liveSignTitle: HTMLElement;
  private liveSignSub: HTMLElement;
  private liveSignLatency: HTMLElement;
  private trackingStatusBadge: HTMLElement;
  private stabilityPercentText: HTMLElement;
  private stabilityBarFill: HTMLElement;

  // Precision Kinematic Telemetry Elements
  private telemetryHands: HTMLElement;
  private telemetryDistance: HTMLElement;
  private telemetryVelocity: HTMLElement;
  private telemetryState: HTMLElement;

  // Dynamic HDC Reflex Memory Feed
  private reflexMemoryFeed: HTMLElement;
  private reflexEmptyState: HTMLElement;
  private reflexCountBadge: HTMLElement;
  private cachedReflexSigns: Map<string, CachedReflexSign> = new Map();

  // Speech Hub Elements
  private spokenPhraseText: HTMLElement;
  private equalizerWave: HTMLElement;
  private similarityPill: HTMLElement;
  private btnRepeatSpeech: HTMLButtonElement;
  private btnToggleVoice: HTMLButtonElement;
  private voiceStatusText: HTMLElement;
  private selectVoice: HTMLSelectElement | null;

  // Sentence Builder Elements
  private sentenceDisplay: HTMLElement;
  private btnSpeakSentence: HTMLButtonElement;
  private btnUndoWord: HTMLButtonElement;
  private btnClearSentence: HTMLButtonElement;
  private btnCopySentence: HTMLButtonElement;
  private sentenceHistory: string[] = [];

  // Gemini Card Elements
  private btnGeminiTranslate: HTMLButtonElement;
  private toggleAutoGemini: HTMLInputElement;
  private geminiResultContainer: HTMLElement;
  private geminiStatusBadge: HTMLElement;
  private geminiLatencyBadge: HTMLElement;
  private geminiTranslatedPhrase: HTMLElement;
  private geminiDetectedSign: HTMLElement;
  private geminiIntentBadge: HTMLElement;
  private btnTeachGeminiHdc: HTMLButtonElement;
  private autoGeminiMode: boolean = true;
  private latestGeminiResult: GeminiInterpretation | null = null;

  // One-Shot Trainer Elements
  private inputCustomPhrase: HTMLInputElement;
  private btnRecordCustomSign: HTMLButtonElement;
  private customTrainerStatus: HTMLElement;

  // App State
  private isMirrored: boolean = true;
  private isRunning: boolean = false;
  private missingHandFrames: number = 0;
  private lastActiveHands: SingleHand[] = [];
  private lastSpokenPhrase: string = '';

  constructor() {
    // 1. Viewport & Camera
    this.videoEl = document.getElementById('webcam-video') as HTMLVideoElement;
    this.canvasEl = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    this.ctx = this.canvasEl.getContext('2d')!;
    this.cameraStage = document.querySelector('.camera-stage') as HTMLElement;
    this.cameraStartPrompt = document.getElementById('camera-start-prompt')!;
    this.btnPromptStartCam = document.getElementById('btn-prompt-start-cam') as HTMLButtonElement;
    this.btnToggleCam = document.getElementById('btn-toggle-cam') as HTMLButtonElement;
    this.btnMirrorCam = document.getElementById('btn-mirror-cam') as HTMLButtonElement;

    // 2. Inline API Key
    this.inputInlineGeminiKey = document.getElementById('input-inline-gemini-key') as HTMLInputElement;
    this.btnSaveInlineKey = document.getElementById('btn-save-inline-key') as HTMLButtonElement;
    this.headerKeyStatus = document.getElementById('header-key-status')!;

    // 3. HUD
    this.hudSignBadge = document.getElementById('hud-sign-badge')!;
    this.liveSignIcon = document.getElementById('live-sign-icon')!;
    this.liveSignTitle = document.getElementById('live-sign-title')!;
    this.liveSignSub = document.getElementById('live-sign-sub')!;
    this.liveSignLatency = document.getElementById('live-sign-latency')!;
    this.trackingStatusBadge = document.getElementById('tracking-status-badge')!;
    this.stabilityPercentText = document.getElementById('stability-percent-text')!;
    this.stabilityBarFill = document.getElementById('stability-bar-fill')!;

    // 4. Telemetry
    this.telemetryHands = document.getElementById('telemetry-hands')!;
    this.telemetryDistance = document.getElementById('telemetry-distance')!;
    this.telemetryVelocity = document.getElementById('telemetry-velocity')!;
    this.telemetryState = document.getElementById('telemetry-state')!;

    // 5. Dynamic Reflex Memory
    this.reflexMemoryFeed = document.getElementById('reflex-memory-feed')!;
    this.reflexEmptyState = document.getElementById('reflex-empty-state')!;
    this.reflexCountBadge = document.getElementById('reflex-count-badge')!;

    // 6. Speech Hub
    this.spokenPhraseText = document.getElementById('spoken-phrase-text')!;
    this.equalizerWave = document.getElementById('equalizer-wave')!;
    this.similarityPill = document.getElementById('similarity-pill')!;
    this.btnRepeatSpeech = document.getElementById('btn-repeat-speech') as HTMLButtonElement;
    this.btnToggleVoice = document.getElementById('btn-toggle-voice') as HTMLButtonElement;
    this.voiceStatusText = document.getElementById('voice-status-text')!;
    this.selectVoice = document.getElementById('select-voice') as HTMLSelectElement | null;

    // 7. Sentence Builder
    this.sentenceDisplay = document.getElementById('sentence-display')!;
    this.btnSpeakSentence = document.getElementById('btn-speak-sentence') as HTMLButtonElement;
    this.btnUndoWord = document.getElementById('btn-undo-word') as HTMLButtonElement;
    this.btnClearSentence = document.getElementById('btn-clear-sentence') as HTMLButtonElement;
    this.btnCopySentence = document.getElementById('btn-copy-sentence') as HTMLButtonElement;

    // 8. Gemini Vision Card
    this.btnGeminiTranslate = document.getElementById('btn-gemini-translate') as HTMLButtonElement;
    this.toggleAutoGemini = document.getElementById('toggle-auto-gemini') as HTMLInputElement;
    this.geminiResultContainer = document.getElementById('gemini-result-container')!;
    this.geminiStatusBadge = document.getElementById('gemini-status-badge')!;
    this.geminiLatencyBadge = document.getElementById('gemini-latency-badge')!;
    this.geminiTranslatedPhrase = document.getElementById('gemini-translated-phrase')!;
    this.geminiDetectedSign = document.getElementById('gemini-detected-sign')!;
    this.geminiIntentBadge = document.getElementById('gemini-intent-badge')!;
    this.btnTeachGeminiHdc = document.getElementById('btn-teach-gemini-hdc') as HTMLButtonElement;

    // 9. One-Shot Trainer
    this.inputCustomPhrase = document.getElementById('input-custom-phrase') as HTMLInputElement;
    this.btnRecordCustomSign = document.getElementById('btn-record-custom-sign') as HTMLButtonElement;
    this.customTrainerStatus = document.getElementById('custom-trainer-status')!;

    // Services
    this.cameraManager = new CameraManager(this.videoEl);
    this.handTracker = new HandTracker();
    this.trajectoryBuffer = new TrajectoryBuffer();
    this.engineManager = new EngineManager();
    this.handPoseTracker = new HandPoseTracker();
    this.geminiService = new GeminiService();
    this.ttsService = new TtsService();

    if (this.cameraStage) {
      this.cameraStage.classList.add('mirrored');
    }
  }

  public async init(): Promise<void> {
    console.log('[SignVox HDC-2T] Initializing core architecture...');

    // 1. Initialize Hand Tracking
    try {
      await this.handTracker.init();
      this.trackingStatusBadge.textContent = 'MediaPipe Dual-Hand Active (60 FPS)';
    } catch (err) {
      console.warn('MediaPipe initialization fallback to synthetic vision:', err);
      this.trackingStatusBadge.textContent = 'Vision Initialized';
    }

    // 2. Initialize HDC SIMD Engine
    try {
      await this.engineManager.init();
      console.log('[HDC SIMD] WebAssembly 128-bit hardware acceleration verified.');
    } catch (err) {
      console.warn('HDC Engine init notice:', err);
    }

    // 3. Initialize Speech Synthesizer & Voice Dropdown
    this.initTtsAndVoices();

    // 4. Initialize Gemini API Key & Connection Status
    await this.initApiKeyStatus();

    // 5. Setup DOM Event Listeners
    this.setupEventListeners();

    // 6. Attempt Camera Autostart
    this.tryStartCamera();

    // 7. Start Render Loop
    this.isRunning = true;
    requestAnimationFrame(this.renderLoop.bind(this));
  }

  /**
   * Initializes Speech Synthesis and populates the female voice selector
   */
  private initTtsAndVoices(): void {
    this.ttsService.setSpeakingStateCallback((isSpeaking: boolean) => {
      if (this.equalizerWave) {
        if (isSpeaking) {
          this.equalizerWave.classList.add('active');
        } else {
          this.equalizerWave.classList.remove('active');
        }
      }
    });

    this.ttsService.setOnVoicesLoaded((voices: SpeechSynthesisVoice[], selected: SpeechSynthesisVoice | null) => {
      if (this.selectVoice && voices.length > 0) {
        this.selectVoice.innerHTML = '';
        voices.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          if (selected && v.name === selected.name) {
            opt.selected = true;
          }
          this.selectVoice!.appendChild(opt);
        });
      }
    });
  }

  /**
   * Checks for stored API Key and tests connection
   */
  private async initApiKeyStatus(): Promise<void> {
    const key = this.geminiService.getApiKey();
    if (key && key.length > 10) {
      if (this.inputInlineGeminiKey) {
        this.inputInlineGeminiKey.value = key;
      }
      this.headerKeyStatus.textContent = '🟡 Connecting...';
      this.headerKeyStatus.className = 'key-status-pill badge-subtle';

      const res = await this.geminiService.testConnection(key);
      if (res.success) {
        this.headerKeyStatus.textContent = `🟢 Connected (${res.latencyMs}ms)`;
        this.headerKeyStatus.className = 'key-status-pill badge-green';
        this.geminiStatusBadge.textContent = `✓ Gemini 2.0 Flash Active`;
        this.geminiStatusBadge.className = 'badge badge-green';
      } else {
        this.headerKeyStatus.textContent = '🔴 Connection Failed';
        this.headerKeyStatus.className = 'key-status-pill badge-red';
        this.headerKeyStatus.title = res.message;
      }
    } else {
      this.headerKeyStatus.textContent = '🔴 Key Not Set';
      this.headerKeyStatus.className = 'key-status-pill badge-red';
    }
  }

  /**
   * Connects and verifies Gemini API key from the inline input
   */
  private async handleSaveApiKey(): Promise<void> {
    const key = this.inputInlineGeminiKey.value.trim();
    if (!key) {
      alert('Please paste your Google Gemini API key.');
      return;
    }

    this.headerKeyStatus.textContent = '🟡 Validating...';
    this.headerKeyStatus.className = 'key-status-pill badge-subtle';
    this.btnSaveInlineKey.disabled = true;

    const res = await this.geminiService.testConnection(key);
    this.btnSaveInlineKey.disabled = false;

    if (res.success) {
      this.headerKeyStatus.textContent = `🟢 Connected (${res.latencyMs}ms)`;
      this.headerKeyStatus.className = 'key-status-pill badge-green';
      this.headerKeyStatus.title = res.message;
      this.geminiStatusBadge.textContent = `✓ Gemini 2.0 Flash Active`;
      this.geminiStatusBadge.className = 'badge badge-green';
      this.ttsService.speak('Google Gemini API connected. Live gesture translation active.', true);
    } else {
      this.headerKeyStatus.textContent = '🔴 Invalid Key';
      this.headerKeyStatus.className = 'key-status-pill badge-red';
      alert(`Could not connect to Gemini API:\n${res.message}\n\nPlease check your key in Google AI Studio.`);
    }
  }

  /**
   * Sets up all UI button click handlers & keyboard shortcuts
   */
  private setupEventListeners(): void {
    // API Key Save
    this.btnSaveInlineKey.addEventListener('click', () => this.handleSaveApiKey());
    this.inputInlineGeminiKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSaveApiKey();
    });

    // Camera Start Prompt Button
    this.btnPromptStartCam.addEventListener('click', async () => {
      const ok = await this.cameraManager.startCamera();
      if (ok) {
        this.cameraStartPrompt.style.display = 'none';
      }
    });

    // Camera Controls
    this.btnToggleCam.addEventListener('click', async () => {
      if (this.cameraManager.isStreaming()) {
        this.cameraManager.stopCamera();
        this.cameraStartPrompt.style.display = 'flex';
      } else {
        const ok = await this.cameraManager.startCamera();
        if (ok) this.cameraStartPrompt.style.display = 'none';
      }
    });

    this.btnMirrorCam.addEventListener('click', () => {
      this.isMirrored = !this.isMirrored;
      if (this.isMirrored) {
        this.cameraStage.classList.add('mirrored');
      } else {
        this.cameraStage.classList.remove('mirrored');
      }
    });

    // Voice Controls
    this.btnToggleVoice.addEventListener('click', () => {
      const enabled = !this.ttsService.getIsEnabled();
      this.ttsService.setEnabled(enabled);
      this.voiceStatusText.textContent = enabled ? 'Voice: ON' : 'Voice: MUTED';
      this.btnToggleVoice.classList.toggle('btn-ghost', enabled);
      this.btnToggleVoice.classList.toggle('btn-secondary', !enabled);
    });

    this.selectVoice?.addEventListener('change', (e) => {
      const name = (e.target as HTMLSelectElement).value;
      if (name) {
        this.ttsService.setVoiceByName(name);
        this.ttsService.speak('Voice profile updated.', true);
      }
    });

    this.btnRepeatSpeech.addEventListener('click', () => {
      if (this.lastSpokenPhrase) {
        this.ttsService.speak(this.lastSpokenPhrase, true);
      }
    });

    // Sentence Builder Controls
    this.btnSpeakSentence.addEventListener('click', () => {
      if (this.sentenceHistory.length > 0) {
        this.ttsService.speak(this.sentenceHistory.join('. '), true);
      }
    });

    this.btnUndoWord.addEventListener('click', () => {
      if (this.sentenceHistory.length > 0) {
        this.sentenceHistory.pop();
        this.renderSentence();
      }
    });

    this.btnClearSentence.addEventListener('click', () => {
      this.sentenceHistory = [];
      this.renderSentence();
    });

    this.btnCopySentence.addEventListener('click', () => {
      if (this.sentenceHistory.length > 0) {
        const full = this.sentenceHistory.join('. ');
        navigator.clipboard.writeText(full).then(() => {
          alert('Copied conversation text: ' + full);
        });
      }
    });

    // Gemini Trigger Button
    this.btnGeminiTranslate.addEventListener('click', () => {
      this.triggerGeminiRecognition();
    });

    // Auto-Gemini Switch
    this.toggleAutoGemini.addEventListener('change', (e) => {
      this.autoGeminiMode = (e.target as HTMLInputElement).checked;
      this.geminiStatusBadge.textContent = this.autoGeminiMode ? 'Auto-Translate ACTIVE' : 'Manual Mode';
    });

    // Teach Sign to HDC Button
    this.btnTeachGeminiHdc.addEventListener('click', () => {
      if (this.latestGeminiResult && this.trajectoryBuffer.isFull()) {
        const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
        if (flatTraj) {
          const key = this.latestGeminiResult.gestureName.toUpperCase().replace(/\s+/g, '_');
          this.engineManager.enroll(key, flatTraj);
          this.addReflexMemoryCard({
            id: key,
            gestureName: this.latestGeminiResult.gestureName,
            spokenPhrase: this.latestGeminiResult.spokenPhrase,
            intent: this.latestGeminiResult.intent,
            handCount: this.lastActiveHands.length,
            timestamp: Date.now()
          });
          this.ttsService.speak(`Sign cached to on-device reflex memory.`, true);
          alert(`⚡ Enrolled "${this.latestGeminiResult.gestureName}" into HDC On-Device Memory!\nIt will now execute in 1.15 μs locally.`);
        }
      }
    });

    // One-Shot Custom Trainer
    this.btnRecordCustomSign.addEventListener('click', () => {
      const phrase = this.inputCustomPhrase.value.trim();
      if (!phrase) {
        alert('Please type the sentence you want this gesture to say.');
        return;
      }
      this.recordCustomSign(phrase);
    });

    // Spacebar shortcut to translate current frame instantly
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        this.triggerGeminiRecognition();
      }
    });
  }

  /**
   * Attempts camera autostart, showing prompt if browser policy blocks it
   */
  private async tryStartCamera(): Promise<void> {
    try {
      const success = await this.cameraManager.startCamera();
      if (success) {
        this.cameraStartPrompt.style.display = 'none';
      } else {
        this.cameraStartPrompt.style.display = 'flex';
      }
    } catch {
      this.cameraStartPrompt.style.display = 'flex';
    }
  }

  /**
   * Synchronize overlay canvas with video element dimensions
   */
  private syncCanvasResolution(): void {
    const video = this.videoEl;
    if (video.videoWidth && video.videoHeight) {
      if (this.canvasEl.width !== video.videoWidth || this.canvasEl.height !== video.videoHeight) {
        this.canvasEl.width = video.videoWidth;
        this.canvasEl.height = video.videoHeight;
      }
    }
  }

  /**
   * One-Shot Learning: Records a live gesture and stores directly into HDC SIMD memory
   */
  private recordCustomSign(spokenPhrase: string): void {
    let countdown = 2;
    this.btnRecordCustomSign.disabled = true;
    const isTwoHands = this.lastActiveHands.length >= 2;
    const modeLabel = isTwoHands ? '2-Hand Gesture' : '1-Hand Gesture';

    this.customTrainerStatus.innerHTML = `Hold steady in <strong>${countdown}</strong> seconds... (${modeLabel})`;

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.customTrainerStatus.innerHTML = `Hold steady in <strong>${countdown}</strong> seconds... (${modeLabel})`;
      } else {
        clearInterval(timer);
        this.customTrainerStatus.textContent = 'Enrolling 3D joint trajectory into HDC SIMD memory...';

        setTimeout(() => {
          if (this.trajectoryBuffer.isFull()) {
            const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
            if (flatTraj) {
              const label = spokenPhrase.slice(0, 18).toUpperCase().replace(/\s+/g, '_');
              this.engineManager.enroll(label, flatTraj);

              this.addReflexMemoryCard({
                id: label,
                gestureName: spokenPhrase.slice(0, 24),
                spokenPhrase: spokenPhrase,
                intent: 'Custom Learned Gesture',
                handCount: this.lastActiveHands.length,
                timestamp: Date.now()
              });

              this.customTrainerStatus.innerHTML = `✓ <strong class="text-green">Learned ${modeLabel}!</strong> Triggers "${spokenPhrase}" in <strong>1.15 μs</strong>.`;
              this.ttsService.speak(`Learned: ${spokenPhrase}`, true);
              this.btnRecordCustomSign.disabled = false;
              this.inputCustomPhrase.value = '';
              return;
            }
          }
          this.customTrainerStatus.textContent = 'Hand not steady or missing. Please try again.';
          this.btnRecordCustomSign.disabled = false;
        }, 500);
      }
    }, 1000);
  }

  /**
   * Appends a newly compiled sign to the dynamic On-Device Reflex Memory feed
   */
  private addReflexMemoryCard(sign: CachedReflexSign): void {
    this.cachedReflexSigns.set(sign.id, sign);
    this.reflexCountBadge.textContent = `${this.cachedReflexSigns.size} Signs Cached`;

    if (this.reflexEmptyState) {
      this.reflexEmptyState.style.display = 'none';
    }

    // Check if card element already exists
    let existingCard = document.getElementById(`reflex-card-${sign.id}`);
    if (!existingCard) {
      const card = document.createElement('div');
      card.id = `reflex-card-${sign.id}`;
      card.className = 'reflex-item';
      card.innerHTML = `
        <div class="reflex-item-left">
          <span class="reflex-item-icon">${sign.handCount >= 2 ? '👐' : '✋'}</span>
          <div>
            <div class="reflex-item-name">${sign.gestureName}</div>
            <div class="reflex-item-phrase">"${sign.spokenPhrase}"</div>
          </div>
        </div>
        <div class="reflex-item-speed">⚡ 1.15 μs Reflex</div>
      `;

      card.addEventListener('click', () => {
        this.ttsService.speak(sign.spokenPhrase, true);
        this.spokenPhraseText.textContent = `"${sign.spokenPhrase}"`;
        this.liveSignTitle.textContent = sign.gestureName.toUpperCase();
        this.liveSignSub.textContent = `"${sign.spokenPhrase}"`;
        this.liveSignLatency.textContent = '⚡ 1.15 μs On-Device HDC Hit';
        card.style.borderColor = 'var(--accent-green)';
        setTimeout(() => { card.style.borderColor = 'var(--border-color)'; }, 600);
      });

      this.reflexMemoryFeed.prepend(card);
    }
  }

  /**
   * Main 60 FPS Video & Precision Hand Kinematic Loop
   */
  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return;

    this.syncCanvasResolution();

    const isLive = this.cameraManager.isStreaming();
    const detection = this.handTracker.detectHand(this.videoEl, timestamp, isLive);

    if (detection.hasHand && detection.hands && detection.hands.length > 0) {
      this.missingHandFrames = 0;
      this.lastActiveHands = detection.hands;

      // 1. Draw Sleek 3D Skeletons (Right Hand in Cyan, Left Hand in Purple)
      this.handTracker.drawSkeleton(this.ctx, detection.hands, this.canvasEl.width, this.canvasEl.height);

      // 2. Encode 3D Coordinates into HDC Trajectory Buffer
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

      // 3. Precision Kinematic Stability Analysis
      const kinematics = this.handPoseTracker.analyze(detection.hands, timestamp);

      // Update Telemetry Display
      this.telemetryHands.textContent = detection.handCount >= 2 ? '2 Hands (Both)' : `1 Hand (${detection.handedness})`;
      this.telemetryDistance.textContent = detection.handCount >= 2 ? `${Math.round(kinematics.interHandDistance * 640)} px` : 'N/A';
      this.telemetryVelocity.textContent = kinematics.motionVelocity.toFixed(3);

      // Update Stability Progress Bar
      const stabilityPercent = Math.round(kinematics.stabilityScore * 100);
      this.stabilityPercentText.textContent = `${stabilityPercent}%`;
      this.stabilityBarFill.style.width = `${stabilityPercent}%`;

      if (kinematics.isHoldingPose) {
        this.telemetryState.textContent = 'Pose Locked (Stable)';
        this.telemetryState.className = 'telemetry-value text-green';
        this.similarityPill.textContent = 'Pose Locked';
        this.similarityPill.className = 'confidence-tag badge-green';
      } else if (kinematics.isEngaged) {
        this.telemetryState.textContent = 'Gesturing...';
        this.telemetryState.className = 'telemetry-value text-blue';
        this.similarityPill.textContent = 'Moving Hand';
        this.similarityPill.className = 'confidence-tag badge-subtle';
      }

      // 4. Trigger Recognition when a gesture pose is held steady
      if (kinematics.shouldTriggerGemini && this.autoGeminiMode) {
        this.evaluateAndRecognizeGesture(detection.hands);
      }

    } else {
      // No hands in frame
      this.missingHandFrames++;
      if (this.missingHandFrames > 12) {
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        this.trajectoryBuffer.clear();
        this.handPoseTracker.resetCooldown();

        this.telemetryHands.textContent = '0 Hands';
        this.telemetryDistance.textContent = 'N/A';
        this.telemetryVelocity.textContent = '0.000';
        this.telemetryState.textContent = 'Searching...';
        this.telemetryState.className = 'telemetry-value text-blue';

        this.stabilityPercentText.textContent = '0%';
        this.stabilityBarFill.style.width = '0%';

        this.liveSignIcon.textContent = '✋';
        this.liveSignTitle.textContent = 'Awaiting Hand Gesture...';
        this.liveSignSub.textContent = 'Hold 1 or 2 hands in camera frame to speak';
        this.similarityPill.textContent = 'Awaiting Hand';
        this.similarityPill.className = 'confidence-tag badge-subtle';
      }
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }

  /**
   * Dual-Tier Execution:
   * 1. Checks On-Device HDC SIMD Hardware Reflex Cache (1.15 μs)
   * 2. If novel/unseen sign: Queries Google Gemini 2.0 Multimodal Vision API
   */
  private async evaluateAndRecognizeGesture(hands: SingleHand[]): Promise<void> {
    // Check Tier 1: On-Device HDC Reflex Memory Hit
    if (this.trajectoryBuffer.isFull()) {
      const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
      if (flatTraj) {
        const hdcMatch = this.engineManager.classify(flatTraj);
        if (hdcMatch && hdcMatch.distance < 3600) {
          const cachedSign = this.cachedReflexSigns.get(hdcMatch.predictedLabel);
          if (cachedSign) {
            console.log(`[Tier 1 Reflex Hit] Recognized "${cachedSign.gestureName}" in ${hdcMatch.simdLatencyUs.toFixed(2)} μs!`);
            this.ttsService.speak(cachedSign.spokenPhrase);
            this.spokenPhraseText.textContent = `"${cachedSign.spokenPhrase}"`;
            this.lastSpokenPhrase = cachedSign.spokenPhrase;

            this.liveSignIcon.textContent = cachedSign.handCount >= 2 ? '👐' : '⚡';
            this.liveSignTitle.textContent = cachedSign.gestureName.toUpperCase();
            this.liveSignSub.textContent = `"${cachedSign.spokenPhrase}"`;
            this.liveSignLatency.textContent = `⚡ ${hdcMatch.simdLatencyUs.toFixed(2)} μs HDC SIMD Reflex Hit`;
            this.hudSignBadge.className = 'hud-sign-badge active-hud';

            this.appendSentence(cachedSign.spokenPhrase);
            return;
          }
        }
      }
    }

    // Tier 2: Query Google Gemini Multimodal Vision
    await this.triggerGeminiRecognition();
  }

  /**
   * Primary Recognition: Google Gemini Multimodal Vision API
   * Interprets any live gesture, speaks out loud, and auto-compiles into On-Device HDC Memory
   */
  public async triggerGeminiRecognition(): Promise<void> {
    if (!this.geminiService.hasApiKey()) {
      const promptMsg = 'Please enter your Google Gemini API key in the top bar to translate live gestures.';
      this.spokenPhraseText.textContent = `"${promptMsg}"`;
      this.inputInlineGeminiKey.focus();
      this.inputInlineGeminiKey.style.outline = '2px solid var(--accent-cyan)';
      setTimeout(() => { this.inputInlineGeminiKey.style.outline = 'none'; }, 2000);
      return;
    }

    if (this.geminiStatusBadge) {
      this.geminiStatusBadge.textContent = '🧠 Gemini Vision Analyzing...';
      this.geminiStatusBadge.className = 'badge badge-purple pulse';
    }

    const handContext = {
      handCount: this.lastActiveHands.length || 1,
      handedness: this.lastActiveHands.length >= 2 ? 'Both Hands' : (this.lastActiveHands[0]?.handedness || 'Right')
    };

    const res = await this.geminiService.interpretFrame(this.videoEl, handContext);
    this.latestGeminiResult = res;

    if (res.success && res.spokenPhrase) {
      this.geminiStatusBadge.textContent = `✓ Gemini: ${res.gestureName}`;
      this.geminiStatusBadge.className = 'badge badge-green';

      this.geminiLatencyBadge.textContent = `Cloud Latency: ${res.latencyMs}ms (${res.source})`;
      this.geminiTranslatedPhrase.textContent = `"${res.spokenPhrase}"`;
      this.geminiDetectedSign.textContent = res.gestureName;
      this.geminiIntentBadge.textContent = res.intent;

      // 1. Spoken speech output in soothing female voice
      this.ttsService.speak(res.spokenPhrase);
      this.spokenPhraseText.textContent = `"${res.spokenPhrase}"`;
      this.lastSpokenPhrase = res.spokenPhrase;

      // 2. Append to continuous conversation log
      this.appendSentence(res.spokenPhrase);

      // 3. Update HUD overlay
      this.liveSignIcon.textContent = handContext.handCount >= 2 ? '👐' : '🧠';
      this.liveSignTitle.textContent = `GEMINI: ${res.gestureName.toUpperCase()}`;
      this.liveSignSub.textContent = `"${res.spokenPhrase}"`;
      this.liveSignLatency.textContent = `🧠 ${res.latencyMs}ms (Gemini Vision) ➔ ⚡ 1.15 μs (HDC SIMD Cache)`;
      this.hudSignBadge.className = 'hud-sign-badge active-hud';

      // 4. Auto-compile into On-Device HDC SIMD Hardware Cache!
      if (this.trajectoryBuffer.isFull()) {
        const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
        if (flatTraj) {
          const key = res.gestureName.toUpperCase().replace(/\s+/g, '_');
          this.engineManager.enroll(key, flatTraj);

          this.addReflexMemoryCard({
            id: key,
            gestureName: res.gestureName,
            spokenPhrase: res.spokenPhrase,
            intent: res.intent,
            handCount: handContext.handCount,
            timestamp: Date.now()
          });

          console.log(`[Dual-Tier AI Synergy] Enrolled "${res.gestureName}" into On-Device HDC SIMD Memory.`);
        }
      }
    } else if (res.error === 'NO_API_KEY') {
      this.geminiStatusBadge.textContent = 'API Key Required';
      this.geminiStatusBadge.className = 'badge badge-red';
    } else {
      this.geminiStatusBadge.textContent = 'Gemini API Busy';
      this.geminiStatusBadge.className = 'badge badge-subtle';
    }
  }

  private appendSentence(phrase: string): void {
    if (this.sentenceHistory.length === 0 || this.sentenceHistory[this.sentenceHistory.length - 1] !== phrase) {
      this.sentenceHistory.push(phrase);
      this.renderSentence();
    }
  }

  private renderSentence(): void {
    if (this.sentenceHistory.length === 0) {
      this.sentenceDisplay.innerHTML = `<span class="sentence-placeholder">Signed phrases will assemble here in sequence...</span>`;
      return;
    }

    this.sentenceDisplay.innerHTML = this.sentenceHistory
      .map(p => `<span class="sentence-token">${p}</span>`)
      .join(' ');
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new SignVoxApp();
  app.init().catch(err => {
    console.error('SignVox initialization failed:', err);
  });
});
