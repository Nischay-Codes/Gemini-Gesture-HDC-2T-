import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface HandDetectionResult {
  hasHand: boolean;
  landmarks: LandmarkPoint[];
  handedness: string;
}

// Landmark connections for drawing the hand skeleton
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17],
];

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private isReady: boolean = false;
  private syntheticPose: string = 'peace';
  private syntheticTime: number = 0;

  public async init(): Promise<void> {
    try {
      console.log('Initializing MediaPipe HandLandmarker from local assets...');
      const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
      
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isReady = true;
      console.log('MediaPipe HandLandmarker initialized successfully.');
    } catch (err) {
      console.warn('GPU delegate failed or asset error, falling back to CPU or synthetic mode:', err);
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        this.isReady = true;
      } catch (cpuErr) {
        console.warn('CPU landmarker initialization failed, running in synthetic mode:', cpuErr);
        this.isReady = true; // Still ready via synthetic generator
      }
    }
  }

  public setSyntheticPose(pose: string): void {
    this.syntheticPose = pose;
  }

  public detectHand(video: HTMLVideoElement, timestampMs: number, isLiveCamera: boolean): HandDetectionResult {
    if (isLiveCamera) {
      if (this.landmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const result = this.landmarker.detectForVideo(video, timestampMs);
          if (result && result.landmarks && result.landmarks.length > 0) {
            const rawLms = result.landmarks[0];
            const landmarks: LandmarkPoint[] = rawLms.map((pt) => ({
              x: pt.x,
              y: pt.y,
              z: pt.z ?? 0.0,
            }));

            const handedness = result.handedness?.[0]?.[0]?.categoryName ?? 'Right';
            return { hasHand: true, landmarks, handedness };
          }
        } catch (err) {
          // Frame skip
        }
      }
      return { hasHand: false, landmarks: [], handedness: '' };
    }

    return this.generateSyntheticHand();
  }

  public generateSyntheticHand(): HandDetectionResult {
    this.syntheticTime += 0.03;
    const t = this.syntheticTime;
    const lms: LandmarkPoint[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

    // Wrist
    lms[0] = { x: 0.5 + Math.sin(t * 1.5) * 0.02, y: 0.8 + Math.cos(t * 1.2) * 0.02, z: 0 };
    // Middle MCP
    lms[9] = { x: 0.5 + Math.sin(t * 1.5) * 0.02, y: 0.45 + Math.cos(t * 1.2) * 0.02, z: 0 };

    if (this.syntheticPose === 'thumbs_up') {
      lms[1] = { x: 0.42, y: 0.70, z: 0 };
      lms[2] = { x: 0.38, y: 0.55, z: 0 };
      lms[3] = { x: 0.35, y: 0.35, z: 0 };
      lms[4] = { x: 0.35, y: 0.15 + Math.sin(t * 2) * 0.02, z: 0 };
      for (let id = 5; id < 21; id++) {
        const fIdx = Math.floor((id - 5) / 4);
        const j = (id - 5) % 4;
        lms[id] = { x: 0.44 + fIdx * 0.06, y: 0.48 + j * 0.02, z: -0.04 };
      }
    } else if (this.syntheticPose === 'peace') {
      lms[1] = { x: 0.42, y: 0.70, z: 0 };
      lms[2] = { x: 0.44, y: 0.60, z: 0.02 };
      lms[3] = { x: 0.46, y: 0.52, z: 0.02 };
      lms[4] = { x: 0.48, y: 0.48, z: 0.02 };
      for (let j = 0; j < 4; j++) {
        lms[5 + j] = { x: 0.42 - j * 0.04, y: 0.4 - j * 0.10 + Math.sin(t * 2) * 0.01, z: 0 };
        lms[9 + j] = { x: 0.50 + j * 0.04, y: 0.4 - j * 0.10 + Math.cos(t * 2) * 0.01, z: 0 };
      }
      for (let id = 13; id < 21; id++) {
        const fIdx = Math.floor((id - 13) / 4);
        const j = (id - 13) % 4;
        lms[id] = { x: 0.56 + fIdx * 0.06, y: 0.50 + j * 0.02, z: -0.04 };
      }
    } else if (this.syntheticPose === 'wave_left') {
      const offset = Math.sin(t * 3.0) * 0.15;
      lms[0] = { x: 0.5 + offset, y: 0.7, z: 0 };
      for (let i = 1; i < 21; i++) {
        lms[i] = { x: 0.4 + (i % 5) * 0.05 + offset, y: 0.5 - Math.floor(i / 5) * 0.08, z: 0 };
      }
    } else {
      // Default fist
      const fingerBases = [1, 5, 9, 13, 17];
      const fingerXs = [0.38, 0.44, 0.50, 0.56, 0.62];
      for (let fIdx = 0; fIdx < fingerBases.length; fIdx++) {
        const fx = fingerXs[fIdx];
        for (let j = 0; j < 4; j++) {
          const id = fingerBases[fIdx] + j;
          if (id < 21) {
            lms[id] = { x: fx, y: 0.48 + j * 0.02, z: -0.05 };
          }
        }
      }
    }

    return { hasHand: true, landmarks: lms, handedness: 'Right' };
  }

  public drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: LandmarkPoint[],
    width: number,
    height: number,
    corruptedIndices?: Set<number>
  ): void {
    ctx.clearRect(0, 0, width, height);

    if (landmarks.length < 21) return;

    const hasCorruption = corruptedIndices && corruptedIndices.size > 0;

    // 1. Subtle Sub-surface Palm Mesh (connecting wrist to MCP knuckles)
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    ctx.beginPath();
    ctx.moveTo(wrist.x * width, wrist.y * height);
    ctx.lineTo(indexMcp.x * width, indexMcp.y * height);
    ctx.lineTo(pinkyMcp.x * width, pinkyMcp.y * height);
    ctx.closePath();
    ctx.fillStyle = hasCorruption ? 'rgba(239, 68, 68, 0.08)' : 'rgba(56, 189, 248, 0.05)';
    ctx.fill();

    // 2. Precision Laser Skeletal Bones
    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [start, end] of HAND_CONNECTIONS) {
      const isBoneCorrupted = corruptedIndices && (corruptedIndices.has(start) || corruptedIndices.has(end));
      const p1 = landmarks[start];
      const p2 = landmarks[end];

      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);

      if (isBoneCorrupted) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
        ctx.shadowBlur = 4;
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.shadowColor = 'rgba(56, 189, 248, 0.45)';
        ctx.shadowBlur = 3;
      }
      ctx.stroke();
    }
    ctx.restore();

    // 3. Precision Optical Tracking Micro-Nodes
    const tipIndices = new Set([4, 8, 12, 16, 20]);

    for (let i = 0; i < landmarks.length; i++) {
      const pt = landmarks[i];
      const px = pt.x * width;
      const py = pt.y * height;
      const isNodeCorrupted = corruptedIndices && corruptedIndices.has(i);

      if (isNodeCorrupted) {
        // Corrupted / Occluded Node: Glitch Crimson Warning Marker
        ctx.beginPath();
        ctx.arc(px, py, 5.0, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 2.0, 0, 2 * Math.PI);
        ctx.fillStyle = '#f87171';
        ctx.fill();
      } else if (i === 0) {
        // Wrist Anchor: Precision origin node with subtle emerald reticle
        ctx.beginPath();
        ctx.arc(px, py, 4.2, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981';
        ctx.fill();
      } else if (tipIndices.has(i)) {
        // Fingertip Reticles
        ctx.beginPath();
        ctx.arc(px, py, 3.8, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        // Intermediate Joint
        ctx.beginPath();
        ctx.arc(px, py, 2.0, 0, 2 * Math.PI);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 3.0, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    // 4. Subtle HUD Status Overlay if noise is active
    if (hasCorruption) {
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.fillText(`⚡ SIMULATED NOISE ACTIVE (${corruptedIndices.size}/21 JOINTS OCCLUDED)`, 12, 22);
      ctx.restore();
    }
  }
}
