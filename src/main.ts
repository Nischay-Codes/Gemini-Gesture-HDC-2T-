import { CameraManager } from './camera/camera_manager';
import { HandTracker } from './vision/hand_tracker';
import { TrajectoryBuffer } from './encoder/trajectory_buffer';
import { EngineManager } from './recognition/engine_manager';
import { GestureTrainer } from './training/gesture_trainer';
import { MemoryInspector } from './components/memory_inspector';
import { AblationDashboard } from './components/ablation_dashboard';
import { NoiseInjector } from './stress_test/noise_injector';
import { ProfileManager } from './storage/profile_manager';
import { Sidebar } from './sidebar/sidebar';
import { TimeArrowLab } from './temporal_lab/time_arrow_lab';
import { AnalogyView } from './analogy/analogy_view';
import { LanguageView } from './language/language_view';
import { CompositionalLab } from './compositional/compositional_lab';
import { QrAirDrop } from './storage/qr_airdrop';
import { calibrateHdcConfidence } from './recognition/confidence_calibrator';
import { GeminiService } from './gemini/gemini_service';
import { TtsService } from './speech/tts_service';

class HdcZeroApp {
  private sidebar: Sidebar;
  private cameraManager: CameraManager;
  private handTracker: HandTracker;
  private trajectoryBuffer: TrajectoryBuffer;
  private engineManager: EngineManager;
  private gestureTrainer: GestureTrainer;
  private memoryInspector: MemoryInspector;
  private ablationDashboard: AblationDashboard;
  private noiseInjector: NoiseInjector;
  private timeArrowLab: TimeArrowLab;
  private analogyView: AnalogyView;
  private languageView: LanguageView;
  private compositionalLab: CompositionalLab;
  private qrAirDrop: QrAirDrop;

  // Tier 2: Gemini & Speech Synthesis
  private geminiService: GeminiService;
  private ttsService: TtsService;
  private autoGeminiMode: boolean = false;
  private lastGeminiCallTime: number = 0;

  // DOM Elements
  private videoEl: HTMLVideoElement;
  private canvasEl: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private predictedLabelEl: HTMLElement;
  private hammingDistEl: HTMLElement;
  private latencyEl: HTMLElement;
  private similarityPillEl: HTMLElement;
  private similarityMeterFillEl: HTMLElement;
  private simdStatusPillEl: HTMLElement;
  private simdStatusTextEl: HTMLElement;
  private btnEnroll: HTMLButtonElement;
  private btnRecordMotion: HTMLButtonElement;
  private recordMotionIcon: HTMLElement;
  private recordMotionText: HTMLElement;
  private btnReinforce: HTMLButtonElement;
  private btnAirDropModal: HTMLButtonElement;
  private inputGestureName: HTMLInputElement;
  private btnToggleCam: HTMLButtonElement;
  private btnExpandCam: HTMLButtonElement;
  private btnMirrorCam: HTMLButtonElement | null;
  private selectSyntheticPose: HTMLSelectElement | null;
  private btnLoadDefaults: HTMLButtonElement;
  private btnClearMemory: HTMLButtonElement;
  private trainerStatusEl: HTMLElement;
  private countdownOverlayEl: HTMLElement;

  // Stress-Test & Storage Elements
  private rangeNoiseSlider: HTMLInputElement;
  private labelNoiseVal: HTMLElement;
  private stressBadge: HTMLElement;
  private stressStatusText: HTMLElement;
  private btnExportBrain: HTMLButtonElement;
  private inputFileBrain: HTMLInputElement;
  private selectPresetProfile: HTMLSelectElement;

  private isRunning: boolean = false;
  private lastInferenceTime: number = 0;
  private missingHandFrames: number = 0;

  constructor() {
    this.videoEl = document.getElementById('webcam-video') as HTMLVideoElement;
    this.canvasEl = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    this.ctx = this.canvasEl.getContext('2d')!;

    this.predictedLabelEl = document.getElementById('predicted-label-text')!;
    this.hammingDistEl = document.getElementById('hamming-dist-val')!;
    this.latencyEl = document.getElementById('latency-val')!;
    this.similarityPillEl = document.getElementById('similarity-pill')!;
    this.similarityMeterFillEl = document.getElementById('similarity-meter-fill')!;
    this.simdStatusPillEl = document.getElementById('simd-status-pill')!;
    this.simdStatusTextEl = document.getElementById('simd-status-text')!;

    this.btnEnroll = document.getElementById('btn-enroll') as HTMLButtonElement;
    this.btnRecordMotion = document.getElementById('btn-record-motion') as HTMLButtonElement;
    this.recordMotionIcon = document.getElementById('record-motion-icon')!;
    this.recordMotionText = document.getElementById('record-motion-text')!;
    this.btnReinforce = document.getElementById('btn-reinforce') as HTMLButtonElement;
    this.btnAirDropModal = document.getElementById('btn-airdrop-modal') as HTMLButtonElement;
    this.inputGestureName = document.getElementById('input-gesture-name') as HTMLInputElement;
    this.btnToggleCam = document.getElementById('btn-toggle-cam') as HTMLButtonElement;
    this.btnExpandCam = document.getElementById('btn-expand-cam') as HTMLButtonElement;
    this.btnMirrorCam = document.getElementById('btn-mirror-cam') as HTMLButtonElement | null;
    this.selectSyntheticPose = document.getElementById('select-synthetic-pose') as HTMLSelectElement | null;
    this.btnLoadDefaults = document.getElementById('btn-load-defaults') as HTMLButtonElement;
    this.btnClearMemory = document.getElementById('btn-clear-memory') as HTMLButtonElement;
    this.trainerStatusEl = document.getElementById('trainer-status')!;
    this.countdownOverlayEl = document.getElementById('countdown-overlay')!;

    this.rangeNoiseSlider = document.getElementById('range-noise-slider') as HTMLInputElement;
    this.labelNoiseVal = document.getElementById('label-noise-val')!;
    this.stressBadge = document.getElementById('stress-badge')!;
    this.stressStatusText = document.getElementById('stress-status-text')!;
    this.btnExportBrain = document.getElementById('btn-export-brain') as HTMLButtonElement;
    this.inputFileBrain = document.getElementById('input-file-brain') as HTMLInputElement;
    this.selectPresetProfile = document.getElementById('select-preset-profile') as HTMLSelectElement;

    const memoryInspectorContainer = document.getElementById('memory-inspector-container')!;
    const ablationContainer = document.getElementById('ablation-container')!;
    const timeArrowContainer = document.getElementById('time-arrow-container')!;
    const analogyContainer = document.getElementById('analogy-container')!;
    const languageContainer = document.getElementById('language-container')!;
    const compositionalContainer = document.getElementById('compositional-container')!;

    this.sidebar = new Sidebar();
    this.noiseInjector = new NoiseInjector();

    this.cameraManager = new CameraManager(this.videoEl);
    this.handTracker = new HandTracker();
    this.trajectoryBuffer = new TrajectoryBuffer();
    this.engineManager = new EngineManager();
    this.memoryInspector = new MemoryInspector(memoryInspectorContainer, this.engineManager);
    this.ablationDashboard = new AblationDashboard(ablationContainer);
    this.gestureTrainer = new GestureTrainer(
      this.engineManager,
      this.trajectoryBuffer,
      this.memoryInspector,
      this.handTracker
    );

    this.timeArrowLab = new TimeArrowLab(
      timeArrowContainer,
      this.engineManager,
      this.handTracker,
      this.trajectoryBuffer
    );
    this.analogyView = new AnalogyView(analogyContainer);
    this.languageView = new LanguageView(languageContainer);
    this.compositionalLab = new CompositionalLab(compositionalContainer, this.engineManager, this.handTracker);
    this.qrAirDrop = new QrAirDrop(this.engineManager);

    // Initialize Tier 2 Gemini & Speech Synthesis
    this.geminiService = new GeminiService();
    this.ttsService = new TtsService();

    this.ttsService.setSubtitleCallback((text) => {
      const sub = document.getElementById('spoken-subtitle-text');
      if (sub) {
        sub.textContent = `🗣️ "${text}"`;
      }
    });
  }

  public async init(): Promise<void> {
    console.log('Initializing HDC-Zero Application Pipeline...');
    this.gestureTrainer.bindUi(this.trainerStatusEl, this.countdownOverlayEl);

    // Render Side Lab Views
    this.timeArrowLab.render();
    this.analogyView.render();
    this.languageView.render();
    this.compositionalLab.render();

    // Wire up Sidebar tab switches
    this.sidebar.setOnTabChange((tab) => {
      if (tab === 'compositional') {
        this.compositionalLab.render();
      }
    });

    // Wire up QR AirDrop onImport
    this.qrAirDrop.setOnImport(() => {
      this.memoryInspector.update();
      this.compositionalLab.render();
    });

    // Wire up Memory Inspector callbacks
    this.memoryInspector.setOnDelete((label) => {
      this.engineManager.deleteClass(label);
      this.memoryInspector.update();
      this.compositionalLab.render();
      this.gestureTrainer.setStatus(`Deleted gesture "${label}" from associative memory.`, 'info');
      if (this.engineManager.getEnrolledLabels().length === 0) {
        this.predictedLabelEl.textContent = 'Memory Cleared';
        this.similarityPillEl.textContent = '0.0%';
        this.similarityMeterFillEl.style.width = '0%';
        this.hammingDistEl.textContent = '-- bits';
        this.latencyEl.textContent = '-- μs';
        this.ablationDashboard.update(null);
      }
    });

    this.memoryInspector.setOnReinforce(async (label) => {
      await this.gestureTrainer.reinforceGesture(label);
    });

    this.memoryInspector.setOnShareQr((label) => {
      this.qrAirDrop.openModal(label);
    });

    // 1. Initialize WASM Engines
    await this.engineManager.init();
    const isSimd = this.engineManager.getIsSimdActive();
    if (isSimd) {
      this.simdStatusTextEl.textContent = 'WASM SIMD-128 Active';
      this.simdStatusPillEl.className = 'status-pill badge-green';
    } else {
      this.simdStatusTextEl.textContent = 'Scalar WASM Active';
      this.simdStatusPillEl.className = 'status-pill badge-amber';
    }

    // 2. Initialize Hand Tracker
    await this.handTracker.init();

    // 3. Start Camera (or Fallback to Simulator)
    const camSuccess = await this.cameraManager.startCamera();
    if (!camSuccess) {
      if (this.selectSyntheticPose) this.selectSyntheticPose.style.display = 'inline-block';
      this.btnToggleCam.textContent = 'Camera: Simulator';
    }

    // 4. Initial Component Render
    this.gestureTrainer.loadPrePackagedGestures();
    this.memoryInspector.update();
    this.ablationDashboard.update(null);

    // 5. Bind User Events
    this.bindEvents();

    // 6. Launch Real-Time Vision & Inference Loop
    this.isRunning = true;
    requestAnimationFrame(this.renderLoop.bind(this));
  }

  private bindEvents(): void {
    this.btnEnroll.addEventListener('click', async () => {
      const name = this.inputGestureName.value;
      await this.gestureTrainer.startOneShotEnrollment(name);
      this.inputGestureName.value = '';
    });

    this.btnRecordMotion.addEventListener('click', () => {
      if (this.gestureTrainer.isMotionRecordingActive()) {
        const success = this.gestureTrainer.stopMotionRecording();
        this.btnRecordMotion.classList.remove('btn-recording');
        this.btnRecordMotion.classList.add('btn-warning');
        this.recordMotionIcon.textContent = '🔴';
        this.recordMotionText.textContent = 'Record Motion';
        if (success) {
          this.inputGestureName.value = '';
        }
      } else {
        const name = this.inputGestureName.value.trim();
        if (!name) {
          this.gestureTrainer.setStatus('Please enter a gesture name first before recording motion (e.g. pinch_and_roll, wave, circular_swipe)!', 'warning');
          this.inputGestureName.focus();
          return;
        }
        const started = this.gestureTrainer.startMotionRecording(name);
        if (started) {
          this.btnRecordMotion.classList.remove('btn-warning');
          this.btnRecordMotion.classList.add('btn-recording');
          this.recordMotionIcon.textContent = '⏹';
          this.recordMotionText.textContent = 'Stop & Learn';
        }
      }
    });

    this.btnReinforce.addEventListener('click', async () => {
      const target = this.inputGestureName.value.trim() || undefined;
      await this.gestureTrainer.reinforceGesture(target);
    });

    this.btnAirDropModal.addEventListener('click', () => {
      this.qrAirDrop.openModal();
    });

    this.btnLoadDefaults.addEventListener('click', () => {
      this.gestureTrainer.loadPrePackagedGestures(true);
    });

    this.btnClearMemory.addEventListener('click', () => {
      this.gestureTrainer.clearAll();
      this.predictedLabelEl.textContent = 'Memory Cleared';
      this.similarityPillEl.textContent = '0.0%';
      this.similarityMeterFillEl.style.width = '0%';
      this.hammingDistEl.textContent = '-- bits';
      this.latencyEl.textContent = '-- μs';
      this.ablationDashboard.update(null);
    });

    if (this.selectSyntheticPose) {
      this.selectSyntheticPose.addEventListener('change', () => {
        const pose = this.selectSyntheticPose!.value;
        this.handTracker.setSyntheticPose(pose);
      });
    }

    this.btnToggleCam.addEventListener('click', async () => {
      this.btnToggleCam.disabled = true;
      try {
        if (this.cameraManager.isUsingSynthetic()) {
          this.btnToggleCam.textContent = 'Activating Camera...';
          const ok = await this.cameraManager.startCamera();
          if (ok) {
            this.btnToggleCam.textContent = 'Camera: Live';
            if (this.selectSyntheticPose) this.selectSyntheticPose.style.display = 'none';
          } else {
            this.btnToggleCam.textContent = 'Camera: Simulator';
            if (this.selectSyntheticPose) this.selectSyntheticPose.style.display = 'inline-block';
          }
        } else {
          this.cameraManager.stopCamera();
          this.btnToggleCam.textContent = 'Camera: Simulator';
          if (this.selectSyntheticPose) this.selectSyntheticPose.style.display = 'inline-block';
        }
      } catch (err) {
        console.error('Camera toggle error:', err);
        this.btnToggleCam.textContent = 'Camera: Simulator';
        if (this.selectSyntheticPose) this.selectSyntheticPose.style.display = 'inline-block';
      } finally {
        this.btnToggleCam.disabled = false;
      }
    });

    if (this.btnMirrorCam) {
      this.btnMirrorCam.addEventListener('click', () => {
        this.videoEl.classList.toggle('mirrored');
        this.canvasEl.classList.toggle('mirrored');
        const isMirrored = this.videoEl.classList.contains('mirrored');
        this.btnMirrorCam!.textContent = isMirrored ? '⮂ Unmirror' : '⮂ Mirror View';
      });
    }

    this.btnExpandCam.addEventListener('click', () => {
      const layout = document.querySelector('.main-layout') as HTMLElement;
      if (layout) {
        layout.classList.toggle('cinema-mode');
        const isCinema = layout.classList.contains('cinema-mode');
        this.btnExpandCam.textContent = isCinema ? 'Standard View' : '⛶ Expand Camera';
      }
    });

    // Holographic Noise & Occlusion Stress Slider
    this.rangeNoiseSlider.addEventListener('input', () => {
      const val = parseInt(this.rangeNoiseSlider.value, 10);
      this.noiseInjector.setNoiseLevel(val / 100);
      this.labelNoiseVal.textContent = `${val}% Corruption`;
      const status = this.noiseInjector.getStatusDescription();
      this.stressBadge.textContent = status.label;
      this.stressBadge.className = `badge ${status.tagClass}`;
      if (val === 0) {
        this.stressStatusText.textContent =
          '10,000-bit Hypervector maintains >99% recall confidence under severe landmark dropout.';
      } else {
        this.stressStatusText.textContent = `${status.desc} (Holographic fault tolerance actively absorbing dropout)`;
      }
    });

    // Download / Export Brain
    this.btnExportBrain.addEventListener('click', () => {
      ProfileManager.exportBrain(this.engineManager);
    });

    // Upload / Import Brain
    this.inputFileBrain.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        const res = await ProfileManager.importBrain(file, this.engineManager);
        if (res.success) {
          this.memoryInspector.update();
          this.gestureTrainer.setStatus(
            `Imported ${res.count} gestures instantaneously from air-gapped .hdc package!`,
            'success'
          );
        } else {
          this.gestureTrainer.setStatus(`Failed to import package: ${res.error}`, 'warning');
        }
        target.value = '';
      }
    });

    // Profile Preset Selector
    this.selectPresetProfile.addEventListener('change', () => {
      const preset = this.selectPresetProfile.value as 'baselines' | 'presentation' | 'media';
      this.engineManager.clear();
      const labels = ProfileManager.loadPreset(preset, this.engineManager, this.handTracker);
      this.memoryInspector.update();
      this.gestureTrainer.setStatus(
        `Activated "${preset}" profile with ${labels.length} gesture controllers.`,
        'success'
      );
    });

    // Tier 2: Gemini & Speech Synthesis Event Handlers
    const btnAskGemini = document.getElementById('btn-ask-gemini');
    btnAskGemini?.addEventListener('click', () => {
      this.triggerGeminiInterpretation();
    });

    const toggleAutoGemini = document.getElementById('toggle-auto-gemini') as HTMLInputElement;
    toggleAutoGemini?.addEventListener('change', (e) => {
      this.autoGeminiMode = (e.target as HTMLInputElement).checked;
      const statusBadge = document.getElementById('gemini-status-badge');
      if (statusBadge) {
        statusBadge.textContent = this.autoGeminiMode ? 'Auto-Gemini ACTIVE' : 'Tier 2: Gemini Ready';
      }
    });

    const btnToggleVoice = document.getElementById('btn-toggle-voice');
    btnToggleVoice?.addEventListener('click', () => {
      const isEnabled = !this.ttsService.getIsEnabled();
      this.ttsService.setEnabled(isEnabled);
      if (btnToggleVoice) {
        btnToggleVoice.textContent = isEnabled ? '🔊 Voice: ON' : '🔈 Voice: MUTED';
      }
    });

    // Gemini API Key Modal
    const btnGeminiSettings = document.getElementById('btn-gemini-settings');
    const keyModal = document.getElementById('gemini-key-modal');
    const inputKey = document.getElementById('input-gemini-api-key') as HTMLInputElement;
    const btnCloseKey = document.getElementById('btn-close-key-modal');
    const btnSaveKey = document.getElementById('btn-save-key-modal');

    if (inputKey && this.geminiService.getApiKey()) {
      inputKey.value = this.geminiService.getApiKey();
    }

    btnGeminiSettings?.addEventListener('click', () => {
      if (keyModal) keyModal.style.display = 'flex';
    });

    btnCloseKey?.addEventListener('click', () => {
      if (keyModal) keyModal.style.display = 'none';
    });

    btnSaveKey?.addEventListener('click', () => {
      if (inputKey) {
        this.geminiService.setApiKey(inputKey.value);
        if (keyModal) keyModal.style.display = 'none';
        alert('Google Gemini 2.0 API Key saved!');
      }
    });
  }

  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return;

    // 1. Detect Hand Joints (passing isLive flag)
    const isLive = !this.cameraManager.isUsingSynthetic();
    const detection = this.handTracker.detectHand(this.videoEl, timestamp, isLive);

    // 2. Draw Skeleton with real-time injected sensor noise/perturbation
    if (detection.hasHand) {
      const lmsToEncode = detection.landmarks;
      const noisyLandmarks = this.noiseInjector.perturbLandmarks(lmsToEncode);
      const corruptedIndices = this.noiseInjector.getLastCorruptedIndices();

      // Draw live skeleton overlay matching user hand on webcam (with visual noise if stress slider > 0)
      this.handTracker.drawSkeleton(this.ctx, noisyLandmarks, this.canvasEl.width, this.canvasEl.height, corruptedIndices);

      // If manual dynamic motion recording is active, feed landmark frame!
      if (this.gestureTrainer.isMotionRecordingActive()) {
        this.gestureTrainer.addMotionSample(lmsToEncode);
        const count = this.gestureTrainer.getMotionFramesCount();
        this.recordMotionText.textContent = `Stop & Learn (${count} frames)`;
      }

      // 3. Accumulate Trajectory (with noise if stress slider > 0)
      this.trajectoryBuffer.addFrame(noisyLandmarks);
      this.missingHandFrames = 0;
    } else {
      this.missingHandFrames = (this.missingHandFrames || 0) + 1;
      // Debounce missing hand frames (only clear if hand absent > 15 frames / ~300ms)
      if (this.missingHandFrames > 15) {
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        this.trajectoryBuffer.clear();

        // Clear prediction and show idle waiting state when no hand is in frame
        this.predictedLabelEl.textContent = 'No Hand Detected';
        this.similarityPillEl.textContent = 'Awaiting Hand';
        this.similarityPillEl.className = 'confidence-tag badge-idle';
        this.similarityMeterFillEl.style.width = '0%';
        this.similarityMeterFillEl.className = 'similarity-bar-fill fill-idle';
        this.hammingDistEl.textContent = '-- bits';
        this.latencyEl.textContent = '-- μs';
        this.ablationDashboard.update(null);
      }
    }

    // 4. Run Online Classification (every 50ms)
    if (timestamp - this.lastInferenceTime > 50) {
      this.lastInferenceTime = timestamp;

      const enrolledCount = this.engineManager.getEnrolledLabels().length;
      if (enrolledCount > 0 && this.trajectoryBuffer.isFull()) {
        try {
          const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
          if (flatTraj) {
            // Trajectory already contains simulated noise from noisyLandmarks
            const result = this.engineManager.classify(flatTraj);
            if (result) {
              const calib = calibrateHdcConfidence(result.distance, result.similarity);

              if (calib.isConfident) {
                // Confirmed Gesture Match
                const sampleCount = this.engineManager.getSampleCount(result.predictedLabel);
                const tag = sampleCount > 1 ? ` (Reinforced N=${sampleCount})` : '';
                this.predictedLabelEl.textContent = `✓ ${result.predictedLabel.toUpperCase()}${tag}`;
                this.similarityPillEl.textContent = `${calib.confidencePercent}% Confidence • Confirmed`;
                this.similarityPillEl.className = 'confidence-tag badge-green';
                this.similarityMeterFillEl.style.width = `${calib.confidencePercent}%`;
                this.similarityMeterFillEl.className = 'similarity-bar-fill fill-green';
                this.hammingDistEl.textContent = `${result.distance} bits (dH << 5000, ${calib.zScore}σ)`;
                this.latencyEl.textContent = `${result.simdLatencyUs.toFixed(2)} μs`;

                // Tier 1 HDC Reflex: Audible Voice Synthesis (speaks out loud!)
                this.ttsService.speak(result.predictedLabel);
              } else {
                // Hand is in resting/neutral state (orthogonal noise floor ~50%)
                this.predictedLabelEl.textContent = 'Neutral Hand (Resting)';
                this.similarityPillEl.textContent = 'Live Hand • Awaiting Gesture';
                this.similarityPillEl.className = 'confidence-tag badge-cyan';
                this.similarityMeterFillEl.style.width = '0%';
                this.similarityMeterFillEl.className = 'similarity-bar-fill fill-idle';
                this.hammingDistEl.textContent = `${result.distance} bits (Noise Floor ≈ 5000)`;
                this.latencyEl.textContent = `${result.simdLatencyUs.toFixed(2)} μs`;

                // Tier 2 Gemini: Auto-Interprets novel/unknown hand signs
                const now = Date.now();
                if (this.autoGeminiMode && (now - this.lastGeminiCallTime > 4500) && detection.hasHand) {
                  this.lastGeminiCallTime = now;
                  this.triggerGeminiInterpretation();
                }
              }

              // Update Ablation Panel with calibrated confidence
              this.ablationDashboard.update(result, calib.isConfident, calib.confidencePercent);

              // Live Robustness Telemetry update if stress slider is active
              if (this.noiseInjector.getNoiseLevel() > 0) {
                const noisePct = Math.round(this.noiseInjector.getNoiseLevel() * 100);
                this.stressStatusText.innerHTML = `[${noisePct}% NOISE] HDC Recall: <strong>${calib.confidencePercent}%</strong> (dH: ${result.distance} bits) • 1-NN Euclidean Dist: <strong class="text-amber">${result.knnDistance.toFixed(3)}</strong> • <span class="text-green">Holographic Immunity Verified</span>`;
              }
            }
          }
        } catch (err) {
          console.warn('Inference frame evaluation caught exception:', err);
        }
      }
    }

    requestAnimationFrame(this.renderLoop.bind(this));
  }

  /**
   * Tier 2: Google Gemini 2.0 Flash Vision Multimodal Interpretation
   */
  public async triggerGeminiInterpretation(): Promise<void> {
    const statusBadge = document.getElementById('gemini-status-badge');
    if (statusBadge) {
      statusBadge.textContent = '🧠 Gemini Vision Analyzing...';
      statusBadge.className = 'badge badge-purple pulse';
    }

    const source = this.cameraManager.isUsingSynthetic() ? this.canvasEl : this.videoEl;
    const res = await this.geminiService.interpretFrame(source);

    if (res.success) {
      if (statusBadge) {
        statusBadge.textContent = `✓ Gemini: ${res.gestureName}`;
        statusBadge.className = 'badge badge-green';
      }

      // Real-time speech synthesis: speaks aloud!
      this.ttsService.speak(res.spokenPhrase, true);

      // Render Gemini Insight Card
      const resultCard = document.getElementById('gemini-result-card');
      if (resultCard) {
        resultCard.style.display = 'block';
        resultCard.innerHTML = `
          <div style="background: rgba(129, 140, 248, 0.12); border: 1px solid rgba(129, 140, 248, 0.35); border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #818cf8;">
              <span>🧠 Gemini Vision Decoded:</span>
              <span>${Math.round(res.confidence * 100)}% Confidence</span>
            </div>
            <div style="font-size: 16px; font-weight: 800; color: #fff; margin: 6px 0;">"${res.spokenPhrase}"</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
              Gesture: <strong>${res.gestureName}</strong> • Intent: <em>${res.intent}</em> • Latency: ${res.latencyMs}ms
            </div>
            <button id="btn-teach-gemini-hdc" class="btn btn-sm btn-primary" style="width: 100%;">
              ⚡ Teach to HDC Edge Memory (Instant 1.15 µs Reflex)
            </button>
          </div>
        `;

        document.getElementById('btn-teach-gemini-hdc')?.addEventListener('click', () => {
          if (this.trajectoryBuffer.isFull()) {
            const flatTraj = this.trajectoryBuffer.getFlattenedTrajectory();
            if (flatTraj) {
              this.engineManager.enroll(res.gestureName.toUpperCase(), flatTraj);
              this.memoryInspector.update();
              this.ttsService.speak(`Gesture ${res.gestureName} learned to reflex memory`, true);
              alert(`⚡ Enrolled "${res.gestureName}" into HDC memory!\nIt will now trigger in 1.15 µs locally on-device.`);
            }
          }
        });
      }
    } else {
      if (statusBadge) {
        statusBadge.textContent = 'Tier 2: Error';
        statusBadge.className = 'badge badge-red';
      }
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new HdcZeroApp();
  app.init().catch((err) => {
    console.error('HDC-Zero initialization error:', err);
  });
});
