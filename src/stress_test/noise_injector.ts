/**
 * Holographic Noise & Sensor Occlusion Stress-Test Injector.
 * Simulates real-world sensor dropout, low-light noise, and camera occlusions
 * to demonstrate the holographic fault-tolerance of Kanerva's Binary Spatter Codes
 * vs the brittleness of classical Euclidean nearest neighbors.
 */
export interface PerturbationResult {
  landmarks: Array<{ x: number; y: number; z: number }>;
  corruptedIndices: Set<number>;
}

export class NoiseInjector {
  private noiseLevel: number = 0; // 0.0 to 0.50
  private lastCorruptedIndices: Set<number> = new Set();

  public setNoiseLevel(level: number): void {
    this.noiseLevel = Math.max(0, Math.min(0.5, level));
  }

  public getNoiseLevel(): number {
    return this.noiseLevel;
  }

  public getSignalIntegrityPercent(): number {
    return Math.round((1 - this.noiseLevel) * 100);
  }

  public getLastCorruptedIndices(): Set<number> {
    return this.lastCorruptedIndices;
  }

  public getStatusDescription(): { label: string; tagClass: string; desc: string } {
    if (this.noiseLevel === 0) {
      return {
        label: 'Clean Feed (0% Noise)',
        tagClass: 'badge-green',
        desc: 'Ideal sensor input. 100% joint landmark integrity.',
      };
    } else if (this.noiseLevel <= 0.15) {
      return {
        label: `Mild Noise (${Math.round(this.noiseLevel * 100)}%)`,
        tagClass: 'badge-cyan',
        desc: 'Low-light jitter and minor sensor packet drops.',
      };
    } else if (this.noiseLevel <= 0.35) {
      return {
        label: `Heavy Occlusion (${Math.round(this.noiseLevel * 100)}%)`,
        tagClass: 'badge-amber',
        desc: 'Partial hand occlusion and severe webcam frame noise.',
      };
    } else {
      return {
        label: `Extreme Dropout (${Math.round(this.noiseLevel * 100)}%)`,
        tagClass: 'badge-red',
        desc: 'Half of all landmarks corrupted. Classical baselines collapse!',
      };
    }
  }

  /**
   * Injects noise and occlusion into 21 visual hand landmarks.
   * Tracks corrupted landmark indices so the canvas can render glitched occlusion markers.
   */
  public perturbLandmarks(
    landmarks: Array<{ x: number; y: number; z: number }>
  ): Array<{ x: number; y: number; z: number }> {
    this.lastCorruptedIndices.clear();

    if (this.noiseLevel <= 0 || landmarks.length === 0) {
      return landmarks;
    }

    return landmarks.map((pt, idx) => {
      // Wrist (idx 0) has lower dropout chance to preserve global translation frame
      const dropProb = idx === 0 ? this.noiseLevel * 0.25 : this.noiseLevel;
      if (Math.random() < dropProb) {
        this.lastCorruptedIndices.add(idx);
        // Realistic sensor occlusion: displacement jitter and coordinate loss
        const intensity = this.noiseLevel / 0.5;
        const jitterX = (Math.random() - 0.5) * 0.14 * intensity;
        const jitterY = (Math.random() - 0.5) * 0.14 * intensity;
        const jitterZ = (Math.random() - 0.5) * 0.14 * intensity;
        return {
          x: Math.max(0.05, Math.min(0.95, pt.x + jitterX)),
          y: Math.max(0.05, Math.min(0.95, pt.y + jitterY)),
          z: pt.z + jitterZ,
        };
      }
      return { ...pt };
    });
  }
}
