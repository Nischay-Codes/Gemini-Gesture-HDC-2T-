import { EngineManager } from '../recognition/engine_manager';
import { Icons } from './icons';

export class MemoryInspector {
  private container: HTMLElement;
  private engineManager: EngineManager;
  private onDeleteCallback: ((label: string) => void) | null = null;
  private onReinforceCallback: ((label: string) => void) | null = null;
  private onShareQrCallback: ((label: string) => void) | null = null;

  constructor(container: HTMLElement, engineManager: EngineManager) {
    this.container = container;
    this.engineManager = engineManager;
  }

  public setOnDelete(cb: (label: string) => void): void {
    this.onDeleteCallback = cb;
  }

  public setOnReinforce(cb: (label: string) => void): void {
    this.onReinforceCallback = cb;
  }

  public setOnShareQr(cb: (label: string) => void): void {
    this.onShareQrCallback = cb;
  }

  public update(): void {
    const labels = this.engineManager.getEnrolledLabels();
    if (labels.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p class="text-muted">No classes enrolled in associative memory yet.</p>
          <span class="subtext">Capture a 1-shot gesture above to inspect its 10,000-bit prototype.</span>
        </div>
      `;
      return;
    }

    let html = `
      <div class="memory-grid-container">
        <div class="inspector-header">
          <div class="inspector-title">
            <span class="pulse-indicator"></span>
            <span>Associative Item Memory (IM) Inspector</span>
          </div>
          <span class="badge badge-cyan">${labels.length} Classes Stored (${(labels.length * 1.25).toFixed(2)} KB)</span>
        </div>
        <div class="prototypes-row">
    `;

    for (const label of labels) {
      const density = this.engineManager.getPrototypeBitDensity(label);
      const count = this.engineManager.getSampleCount(label);

      html += `
        <div class="prototype-card" id="card-proto-${label}">
          <div class="prototype-header">
            <div class="prototype-title-area">
              <strong class="gesture-name" title="${label}">${label}</strong>
              <span class="sample-tag ${count > 1 ? 'sample-tag-reinforced' : 'sample-tag-oneshot'}">
                ${count > 1 ? `N=${count} (Reinforced)` : '1-Shot (N=1)'}
              </span>
            </div>
            <div class="card-action-btns">
              <button class="btn-card-action btn-reinforce-card" data-label="${label}" title="⚡ Reinforce gesture '${label}' (+1 demonstration)">
                ${Icons.zap}
              </button>
              <button class="btn-card-action btn-qr-card" data-label="${label}" title="AirDrop for Brains / QR Code">
                ${Icons.qr}
              </button>
              <button class="btn-card-action btn-delete-class" data-label="${label}" title="Delete gesture '${label}'">
                ${Icons.trash}
              </button>
            </div>
          </div>
          <div class="canvas-wrapper">
            <canvas id="canvas-proto-${label}" width="100" height="100" class="barcode-canvas" title="${label}: 10,000-bit Binary Spatter Code"></canvas>
          </div>
          <div class="prototype-meta">
            <span>${(density * 100).toFixed(1)}% density</span>
            <span>1,250 B</span>
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    // Attach Event Listeners
    const deleteButtons = this.container.querySelectorAll('.btn-delete-class');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLabel = (btn as HTMLElement).getAttribute('data-label');
        if (targetLabel && this.onDeleteCallback) {
          this.onDeleteCallback(targetLabel);
        }
      });
    });

    const reinforceButtons = this.container.querySelectorAll('.btn-reinforce-card');
    reinforceButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLabel = (btn as HTMLElement).getAttribute('data-label');
        if (targetLabel && this.onReinforceCallback) {
          this.onReinforceCallback(targetLabel);
        }
      });
    });

    const qrButtons = this.container.querySelectorAll('.btn-qr-card');
    qrButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLabel = (btn as HTMLElement).getAttribute('data-label');
        if (targetLabel && this.onShareQrCallback) {
          this.onShareQrCallback(targetLabel);
        }
      });
    });

    // Render the 10,000 bits on each canvas (100x100 pixels)
    for (const label of labels) {
      const bytes = this.engineManager.getPrototypeBytes(label);
      if (!bytes) continue;

      const canvas = document.getElementById(`canvas-proto-${label}`) as HTMLCanvasElement;
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const imgData = ctx.createImageData(100, 100);
      const data = imgData.data;

      // 1,250 bytes x 8 bits = 10,000 bits
      for (let bitIdx = 0; bitIdx < 10000; bitIdx++) {
        const byteIdx = Math.floor(bitIdx / 8);
        const bitOffset = bitIdx % 8;
        const isOne = (bytes[byteIdx] & (1 << bitOffset)) !== 0;

        const pixelIdx = bitIdx * 4;
        if (isOne) {
          // Neon Cyan for bit 1
          data[pixelIdx] = 0;      // R
          data[pixelIdx + 1] = 240; // G
          data[pixelIdx + 2] = 255; // B
          data[pixelIdx + 3] = 255; // A
        } else {
          // Deep Slate for bit 0
          data[pixelIdx] = 15;     // R
          data[pixelIdx + 1] = 23;  // G
          data[pixelIdx + 2] = 42;  // B
          data[pixelIdx + 3] = 255; // A
        }
      }

      ctx.putImageData(imgData, 0, 0);
    }
  }
}
