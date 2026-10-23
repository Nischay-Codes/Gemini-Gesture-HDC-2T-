import { EngineManager } from '../recognition/engine_manager';
import { TrajectoryBuffer, normalizePalmOrientation } from '../encoder/trajectory_buffer';
import { MemoryInspector } from '../components/memory_inspector';
import { HandTracker } from '../vision/hand_tracker';

export class GestureTrainer {
  private engineManager: EngineManager;
  private buffer: TrajectoryBuffer;
  private memoryInspector: MemoryInspector;
  private handTracker: HandTracker;
  private isRecording: boolean = false;
  private recordingFrames: Float64Array[] = [];
  private countdownValue: number = 0;
  private statusElement: HTMLElement | null = null;
  private countdownElement: HTMLElement | null = null;

  // Flexible Dynamic Motion Recording
  private isMotionRecording: boolean = false;
  private motionRecordingFrames: Float64Array[] = [];
  private motionTargetLabel: string = '';
  private motionStartTime: number = 0;

  constructor(
    engineManager: EngineManager,
    buffer: TrajectoryBuffer,
    memoryInspector: MemoryInspector,
    handTracker: HandTracker
  ) {
    this.engineManager = engineManager;
    this.buffer = buffer;
    this.memoryInspector = memoryInspector;
    this.handTracker = handTracker;
  }

  public bindUi(statusEl: HTMLElement, countdownEl?: HTMLElement): void {
    this.statusElement = statusEl;
    if (countdownEl) {
      this.countdownElement = countdownEl;
    }
  }

  public setStatus(msg: string, type: 'info' | 'success' | 'warning' = 'info'): void {
    if (this.statusElement) {
      this.statusElement.textContent = msg;
      this.statusElement.className = `status-banner status-${type}`;
    }
  }

  public async startOneShotEnrollment(label: string): Promise<boolean> {
    if (this.isRecording) return false;
    if (!label.trim()) {
      this.setStatus('Please enter a gesture label first!', 'warning');
      return false;
    }

    this.isRecording = true;
    this.setStatus(`Preparing 1-Shot Capture for "${label}"... Hold pose!`, 'info');

    // 3-2-1 Countdown
    if (this.countdownElement) {
      this.countdownElement.classList.remove('hidden');
    }

    for (let c = 3; c > 0; c--) {
      this.setStatus(`Get Ready: Capturing "${label}" in ${c}...`, 'info');
      if (this.countdownElement) {
        this.countdownElement.textContent = `${c}`;
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    if (this.countdownElement) {
      this.countdownElement.textContent = 'HOLD';
      setTimeout(() => {
        if (this.countdownElement) this.countdownElement.classList.add('hidden');
      }, 500);
    }

    this.setStatus(`RECORDING 15 FRAMES for "${label}"...`, 'warning');
    this.buffer.clear(true); // skipWarmup = true to collect 15 genuine consecutive frames

    // Wait until buffer has 15 consecutive frames
    const startTime = Date.now();
    while (!this.buffer.isFull()) {
      await new Promise((r) => setTimeout(r, 20));
      if (Date.now() - startTime > 4000) {
        this.setStatus('Capture timed out: Please ensure hand is clearly visible in camera.', 'warning');
        this.isRecording = false;
        return false;
      }
    }

    const flatTraj = this.buffer.getFlattenedTrajectory();
    if (!flatTraj) {
      this.setStatus('Failed to collect trajectory frames.', 'warning');
      this.isRecording = false;
      return false;
    }

    // Enroll into both engines in < 2ms!
    const t0 = performance.now();
    this.engineManager.enroll(label.trim(), flatTraj);
    const t1 = performance.now();

    const enrollTimeMs = (t1 - t0).toFixed(2);
    this.setStatus(`✓ Enrolled "${label}" instantaneously in ${enrollTimeMs}ms (0 backprop)!`, 'success');
    this.isRecording = false;

    this.saveGesturesToStorage();
    this.memoryInspector.update();
    return true;
  }

  /**
   * Captures the live 15-frame trajectory with interactive countdown and fuses it into the target gesture prototype.
   * Updates the continuous centroid in <0.5 ms without retraining or forgetting other classes.
   */
  public async reinforceGesture(targetLabel?: string): Promise<boolean> {
    if (this.isRecording) return false;

    const enrolled = this.engineManager.getEnrolledLabels();
    if (enrolled.length === 0) {
      this.setStatus('No gestures enrolled yet to reinforce! Enroll a gesture first.', 'warning');
      return false;
    }

    // Smart target resolution:
    // 1. Specified parameter (e.g. from memory card click)
    // 2. Currently active / predicted gesture in live camera
    // 3. Most recently enrolled class
    let label = targetLabel?.trim();
    if (!label) {
      const latest = this.engineManager.getLatestResult();
      if (latest && latest.predictedLabel && latest.similarity >= 0.515 && enrolled.includes(latest.predictedLabel)) {
        label = latest.predictedLabel;
      } else {
        label = enrolled[enrolled.length - 1];
      }
    }

    this.isRecording = true;
    const currentCount = this.engineManager.getSampleCount(label);
    const nextCount = currentCount + 1;

    this.setStatus(`Preparing Reinforcement for "${label}" (Demonstration #${nextCount})... Hold pose!`, 'info');

    // 3-2-1 Interactive Countdown so user has time to form the gesture in front of the camera
    if (this.countdownElement) {
      this.countdownElement.classList.remove('hidden');
    }

    for (let c = 3; c > 0; c--) {
      this.setStatus(`Get Ready: Reinforcing "${label}" (Demonstration #${nextCount}) in ${c}...`, 'info');
      if (this.countdownElement) {
        this.countdownElement.textContent = `${c}`;
      }
      await new Promise((r) => setTimeout(r, 650));
    }

    if (this.countdownElement) {
      this.countdownElement.textContent = 'HOLD';
      setTimeout(() => {
        if (this.countdownElement) this.countdownElement.classList.add('hidden');
      }, 500);
    }

    this.setStatus(`RECORDING 15 FRAMES for "${label}" reinforcement...`, 'warning');
    this.buffer.clear(true); // skipWarmup = true to collect 15 genuine real-time frames

    // Wait until buffer has 15 consecutive frames of the steady demonstration
    const startTime = Date.now();
    while (!this.buffer.isFull()) {
      await new Promise((r) => setTimeout(r, 20));
      if (Date.now() - startTime > 4000) {
        this.setStatus('Reinforcement timed out: Please ensure hand is steady in front of camera.', 'warning');
        this.isRecording = false;
        return false;
      }
    }

    const flatTraj = this.buffer.getFlattenedTrajectory();
    if (!flatTraj) {
      this.setStatus('Failed to read trajectory buffer for reinforcement.', 'warning');
      this.isRecording = false;
      return false;
    }

    const res = this.engineManager.reinforce(label, flatTraj);
    this.isRecording = false;

    if (res.success) {
      this.setStatus(
        `✓ Reinforced "${label}" with Demonstration #${res.sampleCount}! Class prototype updated in ${res.latencyMs.toFixed(2)}ms with ZERO backpropagation.`,
        'success'
      );
      this.saveGesturesToStorage();
      this.memoryInspector.update();
      return true;
    } else {
      this.setStatus(`Failed to reinforce gesture "${label}".`, 'warning');
      return false;
    }
  }

  public saveGesturesToStorage(): void {
    try {
      const labels = this.engineManager.getEnrolledLabels();
      const stored: Array<{ label: string; trajectory: number[]; count: number }> = [];
      for (const label of labels) {
        const traj = this.engineManager.getTrajectory(label);
        const count = this.engineManager.getSampleCount(label);
        if (traj) {
          stored.push({ label, trajectory: Array.from(traj), count });
        }
      }
      localStorage.setItem('hdc_zero_enrolled_v4', JSON.stringify(stored));
    } catch (e) {
      console.warn('Failed to save gestures to localStorage:', e);
    }
  }

  public loadGesturesFromStorage(): boolean {
    try {
      // Clear legacy incompatible caches from previous sessions
      localStorage.removeItem('hdc_zero_enrolled_v1');
      localStorage.removeItem('hdc_zero_enrolled_v2');
      localStorage.removeItem('hdc_zero_enrolled_v3');

      const raw = localStorage.getItem('hdc_zero_enrolled_v4');
      if (!raw) return false;
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored) || stored.length === 0) return false;

      this.engineManager.clear();
      for (const item of stored) {
        const flat = new Float64Array(item.trajectory);
        this.engineManager.enroll(item.label, flat, item.count || 1);
      }
      this.memoryInspector.update();
      this.setStatus(`Restored ${stored.length} gestures from browser storage ("${stored.map(s => s.label).join('", "')}").`, 'success');
      return true;
    } catch (e) {
      console.warn('Failed to load gestures from localStorage:', e);
      return false;
    }
  }

  public loadPrePackagedGestures(forceReset: boolean = false): void {
    if (!forceReset && this.loadGesturesFromStorage()) {
      return;
    }

    this.setStatus('Loading pre-packaged demonstration gestures...', 'info');

    const defaultPoses = ['thumbs_up', 'peace', 'fist'];
    for (const pose of defaultPoses) {
      this.handTracker.setSyntheticPose(pose);
      const frames: any[] = [];
      for (let i = 0; i < 15; i++) {
        const rawLms = this.handTracker.generateSyntheticHand().landmarks;
        const normLms = normalizePalmOrientation(rawLms);
        frames.push(normLms);
      }

      // Convert to flat
      const flat = new Float64Array(15 * 63);
      for (let t = 0; t < 15; t++) {
        for (let j = 0; j < 21; j++) {
          flat[t * 63 + j * 3] = frames[t][j].x;
          flat[t * 63 + j * 3 + 1] = frames[t][j].y;
          flat[t * 63 + j * 3 + 2] = frames[t][j].z;
        }
      }
      this.engineManager.enroll(pose, flat);
    }

    this.saveGesturesToStorage();
    this.memoryInspector.update();
    this.setStatus('Loaded 3 baseline gestures ("thumbs_up", "peace", "fist") into Item Memory.', 'success');
  }

  public clearAll(): void {
    try {
      localStorage.removeItem('hdc_zero_enrolled_v4');
      localStorage.removeItem('hdc_zero_enrolled_v3');
      localStorage.removeItem('hdc_zero_enrolled_v2');
      localStorage.removeItem('hdc_zero_enrolled_v1');
    } catch (e) {
      // ignore
    }
    this.engineManager.clear();
    this.buffer.clear();
    this.motionRecordingFrames = [];
    this.isMotionRecording = false;
    this.memoryInspector.update();
    this.setStatus('Cleared all gesture prototypes from memory.', 'info');
  }

  public isMotionRecordingActive(): boolean {
    return this.isMotionRecording;
  }

  public getMotionFramesCount(): number {
    return this.motionRecordingFrames.length;
  }

  /**
   * Starts manual dynamic motion recording without rushed 0.5s timer.
   * User can move naturally for 1 to 3 seconds!
   */
  public startMotionRecording(label: string): boolean {
    if (!label.trim()) {
      this.setStatus('Please enter a gesture name first before recording motion!', 'warning');
      return false;
    }
    this.isMotionRecording = true;
    this.motionTargetLabel = label.trim();
    this.motionRecordingFrames = [];
    this.motionStartTime = Date.now();
    this.setStatus(`🔴 RECORDING MOTION for "${this.motionTargetLabel}"... Move hand naturally! Click "Stop & Learn" when done.`, 'warning');
    return true;
  }

  /**
   * Captures each incoming vision landmark frame during manual recording.
   */
  public addMotionSample(landmarks: any[]): void {
    if (!this.isMotionRecording || !landmarks || landmarks.length !== 21) return;
    const aligned = normalizePalmOrientation(landmarks);
    const flat = new Float64Array(63);
    for (let i = 0; i < 21; i++) {
      flat[i * 3] = aligned[i].x;
      flat[i * 3 + 1] = aligned[i].y;
      flat[i * 3 + 2] = aligned[i].z;
    }
    this.motionRecordingFrames.push(flat);

    const elapsed = ((Date.now() - this.motionStartTime) / 1000).toFixed(1);
    this.setStatus(
      `🔴 Recording Motion: ${this.motionRecordingFrames.length} frames captured (${elapsed}s)... Click "Stop & Learn" when finished!`,
      'warning'
    );
  }

  /**
   * Stops manual recording, resamples the captured trajectory to the canonical 15 frames,
   * and enrolls it into the HDC associative memory instantaneously!
   */
  public stopMotionRecording(): boolean {
    if (!this.isMotionRecording) return false;
    this.isMotionRecording = false;

    const count = this.motionRecordingFrames.length;
    if (count < 5) {
      this.setStatus(`Motion too short (${count} frames). Please record for at least 0.5s to capture motion!`, 'warning');
      return false;
    }

    const elapsed = ((Date.now() - this.motionStartTime) / 1000).toFixed(2);
    this.setStatus(`Normalizing ${count} motion frames (${elapsed}s) into canonical 15-frame temporal trajectory...`, 'info');

    // Smoothly resample M frames into 15 frames using temporal interpolation
    const canonicalTraj = GestureTrainer.resampleTrajectory(this.motionRecordingFrames, 15);

    // Enroll into WASM engines in <2ms!
    const t0 = performance.now();
    this.engineManager.enroll(this.motionTargetLabel, canonicalTraj, 1);
    const t1 = performance.now();

    this.setStatus(
      `✓ Enrolled motion gesture "${this.motionTargetLabel}"! Captured ${count} frames over ${elapsed}s, resampled into 15 frames, and learned in ${(t1 - t0).toFixed(2)}ms (0 backprop)!`,
      'success'
    );

    this.motionRecordingFrames = [];
    this.saveGesturesToStorage();
    this.memoryInspector.update();
    return true;
  }

  /**
   * Smoothly resamples M frames into targetFrames (15) using linear temporal interpolation.
   * Preserves full movement arc regardless of how slow or fast the user performed the gesture!
   */
  public static resampleTrajectory(frames: Float64Array[], targetFrames: number = 15): Float64Array {
    const flat = new Float64Array(targetFrames * 63);
    const m = frames.length;
    if (m === 0) return flat;
    if (m === 1) {
      for (let t = 0; t < targetFrames; t++) {
        flat.set(frames[0], t * 63);
      }
      return flat;
    }

    for (let k = 0; k < targetFrames; k++) {
      const u = (k / (targetFrames - 1)) * (m - 1);
      const i0 = Math.floor(u);
      const i1 = Math.min(m - 1, i0 + 1);
      const frac = u - i0;
      const f0 = frames[i0];
      const f1 = frames[i1];

      for (let j = 0; j < 63; j++) {
        flat[k * 63 + j] = f0[j] * (1 - frac) + f1[j] * frac;
      }
    }
    return flat;
  }
}
