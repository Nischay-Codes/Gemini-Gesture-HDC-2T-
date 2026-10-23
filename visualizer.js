/**
 * GeminiGesture: 10,000-Bit HDC Memory Barcode Inspector & Visualizer
 * 
 * Features:
 * - 10,000-Bit Dual-Barcode Inspection (Query vs Stored Prototype)
 * - Real-time Animated Audio Waveform Equalizer for audible speech
 * - Dynamic Bit-Difference Matrix
 */

import { DIMENSION } from './hdc_kernel.js';

export class HDCVisualizer {
  constructor(queryCanvas, prototypeCanvas = null, waveformCanvas = null) {
    this.queryCanvas = queryCanvas;
    this.queryCtx = queryCanvas.getContext('2d');
    this.prototypeCanvas = prototypeCanvas;
    this.prototypeCtx = prototypeCanvas ? prototypeCanvas.getContext('2d') : null;
    this.waveformCanvas = waveformCanvas;
    this.waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;

    this.imgDataQuery = this.queryCtx.createImageData(100, 100);
    if (this.prototypeCtx) {
      this.imgDataProto = this.prototypeCtx.createImageData(100, 100);
    }

    this.wavePhase = 0;
    this.waveIntensity = 0;
    this.startWaveformLoop();
  }

  /**
   * Render a 10,000-bit Hypervector onto a target canvas as a 100x100 binary heatmap
   */
  renderHypervector(hypervector, target = 'query', mode = 'normal') {
    if (!hypervector) return;

    const ctx = target === 'query' ? this.queryCtx : this.prototypeCtx;
    const canvas = target === 'query' ? this.queryCanvas : this.prototypeCanvas;
    const imgData = target === 'query' ? this.imgDataQuery : this.imgDataProto;

    if (!ctx || !canvas || !imgData) return;

    const data = imgData.data;
    const words = hypervector.words;

    // High-contrast cyber palette
    let r1 = 6, g1 = 182, b1 = 212; // Cyan (Normal query)
    if (mode === 'match') {
      r1 = 16; g1 = 185; b1 = 129; // Emerald (High Confidence Match)
    } else if (mode === 'novel') {
      r1 = 244; g1 = 63; b1 = 94; // Rose (Unknown Sign -> Handoff to Gemini)
    } else if (mode === 'prototype') {
      r1 = 168; g1 = 85; b1 = 247; // Violet (Stored Memory Prototype)
    }

    let bitIdx = 0;
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const pixelIdx = (y * 100 + x) * 4;
        const wordIdx = Math.floor(bitIdx / 32);
        const bitMask = 1 << (bitIdx % 32);
        const isOne = (words[wordIdx] & bitMask) !== 0;

        if (isOne) {
          data[pixelIdx + 0] = r1;
          data[pixelIdx + 1] = g1;
          data[pixelIdx + 2] = b1;
          data[pixelIdx + 3] = 255;
        } else {
          data[pixelIdx + 0] = 10;
          data[pixelIdx + 1] = 15;
          data[pixelIdx + 2] = 28;
          data[pixelIdx + 3] = 255;
        }

        bitIdx++;
        if (bitIdx >= DIMENSION) bitIdx = 0;
      }
    }

    createImageBitmap(imgData).then((bmp) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    });
  }

  setSpeechActive(active) {
    this.targetWaveIntensity = active ? 1.0 : 0.05;
  }

  /**
   * Continuous animated audio waveform equalizer rendering
   */
  startWaveformLoop() {
    if (!this.waveformCanvas || !this.waveformCtx) return;

    this.targetWaveIntensity = 0.05;

    const animate = () => {
      const ctx = this.waveformCtx;
      const w = this.waveformCanvas.width;
      const h = this.waveformCanvas.height;

      // Smooth intensity interpolation
      this.waveIntensity += (this.targetWaveIntensity - this.waveIntensity) * 0.15;
      this.wavePhase += 0.08;

      ctx.clearRect(0, 0, w, h);

      // Render glowing equalizer bars
      const numBars = 32;
      const barWidth = (w / numBars) - 3;

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + 3);
        const factor = Math.sin((i / numBars) * Math.PI); // Dome envelope
        const noise = Math.sin(this.wavePhase + i * 0.4) * Math.cos(this.wavePhase * 0.7 + i * 0.2);
        const barHeight = Math.max(3, (factor * Math.abs(noise) * (h * 0.85) * this.waveIntensity) + (h * 0.08));

        const y = (h - barHeight) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, '#06b6d4');
        grad.addColorStop(0.5, '#3b82f6');
        grad.addColorStop(1, '#8b5cf6');

        ctx.fillStyle = grad;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = this.waveIntensity > 0.3 ? 8 : 0;

        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, barWidth, barHeight, 2) : ctx.rect(x, y, barWidth, barHeight);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }
}
