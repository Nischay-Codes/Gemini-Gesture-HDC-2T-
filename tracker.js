/**
 * GeminiGesture: Hand Landmark Tracking & Biological Simulator
 * 
 * - Integrates MediaPipe Hands (21 3D landmarks) via CDN
 * - Pinned version 0.4.1675469240 for rock-solid stability in Safari & Chrome
 * - Crash-proof frame processing loop with concurrent frame-drop protection
 * - High-contrast Neon Skeletal Overlay on Canvas
 * - Realistic Synthetic Hand Simulator for Fail-Safe Demo Mode
 * - 15-Frame Sliding Trajectory Window
 */

export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17]
];

export class HandTracker {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.isCameraActive = false;
    this.isSimulating = false;
    this.simulatedGestureType = 'open_palm';
    this.simTime = 0;

    this.currentLandmarks = null;
    this.trajectoryWindow = [];
    this.maxWindowSize = 15;

    this.onFrameCallback = null;
    this.mediaPipeHands = null;
    this.cameraUtils = null;
    this.isSending = false;
    this.isMediaPipeReady = false;
  }

  setOnFrameCallback(cb) {
    this.onFrameCallback = cb;
  }

  /**
   * Initialize MediaPipe Hands with pinned stable release
   */
  async initMediaPipe() {
    if (this.mediaPipeHands) return true;

    if (window.Hands) {
      try {
        this.mediaPipeHands = new window.Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
        });

        this.mediaPipeHands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0, // Lite model: ultra fast, low memory, stable in Safari
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        this.mediaPipeHands.onResults((results) => {
          this.isMediaPipeReady = true;
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.handleNewLandmarks(results.multiHandLandmarks[0]);
          } else {
            this.currentLandmarks = null;
          }
          this.render();
        });

        return true;
      } catch (e) {
        console.warn('MediaPipe Hands initialization exception:', e);
        return false;
      }
    } else {
      console.warn('window.Hands is not available on window object.');
      return false;
    }
  }

  /**
   * Start webcam video stream and frame ingestion
   */
  async startCamera() {
    try {
      await this.initMediaPipe();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60 },
          facingMode: 'user'
        }
      });

      this.video.srcObject = stream;
      await this.video.play();
      this.isCameraActive = true;
      this.isSimulating = false;

      // Use MediaPipe Camera helper if available, otherwise use crash-proof rAF loop
      if (window.Camera && this.mediaPipeHands) {
        try {
          this.cameraUtils = new window.Camera(this.video, {
            onFrame: async () => {
              if (!this.isCameraActive) return;
              if (this.isSending) return;
              try {
                this.isSending = true;
                await this.mediaPipeHands.send({ image: this.video });
              } catch (e) {
                // Ignore transient frame errors
              } finally {
                this.isSending = false;
              }
            },
            width: 640,
            height: 480
          });
          await this.cameraUtils.start();
          return true;
        } catch (e) {
          console.warn('window.Camera failed to start, falling back to rAF loop:', e);
        }
      }

      // Robust requestAnimationFrame processing loop
      const processLoop = async () => {
        if (!this.isCameraActive) return;

        if (this.mediaPipeHands && this.video.readyState >= 2 && !this.isSending) {
          try {
            this.isSending = true;
            await this.mediaPipeHands.send({ image: this.video });
          } catch (err) {
            // Drop frame gracefully if MediaPipe is busy
          } finally {
            this.isSending = false;
          }
        }

        if (this.isCameraActive) {
          requestAnimationFrame(processLoop);
        }
      };

      requestAnimationFrame(processLoop);
      return true;
    } catch (err) {
      console.warn('Could not access webcam, falling back to biological simulator:', err);
      this.startSimulator('open_palm');
      return false;
    }
  }

  stopCamera() {
    if (this.cameraUtils) {
      try { this.cameraUtils.stop(); } catch (e) {}
      this.cameraUtils = null;
    }
    if (this.video && this.video.srcObject) {
      const stream = this.video.srcObject;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    this.isCameraActive = false;
  }

  /**
   * Start the biological hand simulator for reliable offline hackathon demos
   */
  startSimulator(gestureType = 'open_palm') {
    this.stopCamera();
    this.isSimulating = true;
    this.simulatedGestureType = gestureType;

    const simLoop = () => {
      if (!this.isSimulating) return;
      this.simTime += 0.04;
      const synthetic = this.generateSyntheticLandmarks(this.simulatedGestureType, this.simTime);
      this.handleNewLandmarks(synthetic);
      this.render();
      requestAnimationFrame(simLoop);
    };
    requestAnimationFrame(simLoop);
  }

  /**
   * Update internal trajectory buffer and notify listener
   */
  handleNewLandmarks(landmarks) {
    this.currentLandmarks = landmarks;
    this.trajectoryWindow.push(landmarks);
    if (this.trajectoryWindow.length > this.maxWindowSize) {
      this.trajectoryWindow.shift();
    }

    if (this.onFrameCallback) {
      this.onFrameCallback(landmarks, this.trajectoryWindow);
    }
  }

  /**
   * Generate mathematically accurate 21-joint 3D hand coordinates
   */
  generateSyntheticLandmarks(type, t) {
    const landmarks = [];
    const baseWrist = { x: 0.5 + 0.04 * Math.sin(t * 1.5), y: 0.72 + 0.02 * Math.cos(t), z: 0.0 };
    landmarks.push(baseWrist);

    let thumbOpen = 0.9, indexOpen = 1.0, middleOpen = 1.0, ringOpen = 0.9, pinkyOpen = 0.9;
    
    if (type === 'open_palm' || type === 'hello') {
      thumbOpen = 1.0; indexOpen = 1.0; middleOpen = 1.0; ringOpen = 1.0; pinkyOpen = 1.0;
      baseWrist.y = 0.68;
    } else if (type === 'thumbs_up') {
      thumbOpen = 1.0; indexOpen = 0.1; middleOpen = 0.1; ringOpen = 0.1; pinkyOpen = 0.1;
      baseWrist.y = 0.65;
    } else if (type === 'peace') {
      thumbOpen = 0.1; indexOpen = 1.0; middleOpen = 1.0; ringOpen = 0.1; pinkyOpen = 0.1;
    } else if (type === 'fist' || type === 'emergency') {
      thumbOpen = 0.1; indexOpen = 0.1; middleOpen = 0.1; ringOpen = 0.1; pinkyOpen = 0.1;
    } else if (type === 'wave') {
      const osc = Math.sin(t * 3.0) * 0.1;
      baseWrist.x = 0.5 + osc;
      thumbOpen = 0.9;
      indexOpen = 0.95 + 0.05 * Math.sin(t * 4);
      middleOpen = 0.95 + 0.05 * Math.sin(t * 4 + 0.2);
      ringOpen = 0.9; pinkyOpen = 0.9;
    } else if (type === 'water') {
      // 3 fingers up (W sign)
      thumbOpen = 0.2; indexOpen = 1.0; middleOpen = 1.0; ringOpen = 1.0; pinkyOpen = 0.1;
    }

    const fingerConfigs = [
      { id: 'thumb', count: 4, open: thumbOpen, dir: { x: -0.065, y: -0.045 } },
      { id: 'index', count: 4, open: indexOpen, dir: { x: -0.035, y: -0.085 } },
      { id: 'middle', count: 4, open: middleOpen, dir: { x: 0.0, y: -0.095 } },
      { id: 'ring', count: 4, open: ringOpen, dir: { x: 0.035, y: -0.085 } },
      { id: 'pinky', count: 4, open: pinkyOpen, dir: { x: 0.065, y: -0.065 } }
    ];

    fingerConfigs.forEach((cfg) => {
      for (let j = 1; j <= cfg.count; j++) {
        const factor = j / 4.0;
        const flex = 1.0 - (1.0 - cfg.open) * (factor > 0.3 ? 0.8 : 0.2);
        const joint = {
          x: baseWrist.x + (cfg.dir.x * j * 0.85),
          y: baseWrist.y + (cfg.dir.y * j * flex),
          z: (factor * 0.05) - (1.0 - flex) * 0.08
        };
        landmarks.push(joint);
      }
    });

    return landmarks;
  }

  /**
   * Render neon skeletal overlay
   */
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Update live HUD badge
    const hudBadge = document.getElementById('hudHandStatus');
    if (hudBadge) {
      if (this.currentLandmarks) {
        hudBadge.innerText = 'AI HAND: DETECTED (21 JOINTS)';
        hudBadge.style.color = 'var(--neon-emerald)';
      } else {
        hudBadge.innerText = 'AI HAND: SEARCHING...';
        hudBadge.style.color = 'var(--neon-amber)';
      }
    }

    if (this.isSimulating) {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#020617');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`● SYNTHETIC HAND ENGINE [${this.simulatedGestureType.toUpperCase()}]`, 20, 36);
    }

    if (!this.currentLandmarks) return;

    // Draw Skeletal Bones (Neon Cyan)
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#06b6d4';

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = this.currentLandmarks[startIdx];
      const p2 = this.currentLandmarks[endIdx];
      if (!p1 || !p2) continue;

      ctx.strokeStyle = '#06b6d4';
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    }

    // Draw Joints (Glowing Magenta / Amber / Emerald)
    ctx.shadowBlur = 14;
    for (let i = 0; i < this.currentLandmarks.length; i++) {
      const pt = this.currentLandmarks[i];
      const px = pt.x * w;
      const py = pt.y * h;

      ctx.beginPath();
      ctx.arc(px, py, i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20 ? 6.5 : 4.5, 0, 2 * Math.PI);

      if (i === 0) {
        ctx.fillStyle = '#ec4899'; // Wrist
        ctx.shadowColor = '#ec4899';
      } else if (i % 4 === 0) {
        ctx.fillStyle = '#f59e0b'; // Fingertips
        ctx.shadowColor = '#f59e0b';
      } else {
        ctx.fillStyle = '#10b981'; // Joints
        ctx.shadowColor = '#10b981';
      }
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }
}
