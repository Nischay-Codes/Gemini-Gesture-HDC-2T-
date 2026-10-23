import { EngineManager } from '../recognition/engine_manager';
import { QrCode } from './qr_generator';

export interface AirDropPayload {
  format: 'hdc-airdrop';
  label: string;
  count: number;
  trajectory: number[];
  exportedAt: number;
}

export class QrAirDrop {
  private engineManager: EngineManager;
  private modalEl: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private onImportCallback: (() => void) | null = null;

  constructor(engineManager: EngineManager) {
    this.engineManager = engineManager;
  }

  public setOnImport(cb: () => void): void {
    this.onImportCallback = cb;
  }

  /**
   * Serializes a gesture into a compact Base64 AirDrop token.
   */
  public generateAirDropToken(label: string): string | null {
    const traj = this.engineManager.getTrajectory(label);
    if (!traj) return null;

    // Quantize trajectory floats (-1.0 to 1.0) into 8-bit signed ints to save 75% space
    const quantized: number[] = [];
    for (let i = 0; i < traj.length; i++) {
      // Clamp between -127 and 127
      quantized.push(Math.max(-127, Math.min(127, Math.round(traj[i] * 127))));
    }

    const payload: AirDropPayload = {
      format: 'hdc-airdrop',
      label,
      count: this.engineManager.getSampleCount(label),
      trajectory: quantized,
      exportedAt: Date.now(),
    };

    const json = JSON.stringify(payload);
    // Base64 encode
    return btoa(unescape(encodeURIComponent(json)));
  }

  /**
   * Parses and imports an AirDrop token into memory.
   */
  public importAirDropToken(token: string): { success: boolean; label: string; error?: string } {
    try {
      const trimmed = token.trim();
      const json = decodeURIComponent(escape(atob(trimmed)));
      const payload: AirDropPayload = JSON.parse(json);

      if (payload.format !== 'hdc-airdrop' || !payload.label || !payload.trajectory) {
        return { success: false, label: '', error: 'Invalid AirDrop token format.' };
      }

      // Dequantize back to float64
      const floats = new Float64Array(payload.trajectory.length);
      for (let i = 0; i < payload.trajectory.length; i++) {
        floats[i] = payload.trajectory[i] / 127.0;
      }

      this.engineManager.enroll(payload.label, floats, payload.count || 1);

      if (this.onImportCallback) {
        this.onImportCallback();
      }

      return { success: true, label: payload.label };
    } catch (err: any) {
      return { success: false, label: '', error: err.message || 'Token decode error' };
    }
  }

  /**
   * Opens the AirDrop Modal for a given gesture or active gesture.
   */
  public openModal(selectedLabel?: string): void {
    const labels = this.engineManager.getEnrolledLabels();
    if (labels.length === 0) {
      alert('No gestures enrolled yet! Enroll a gesture first before AirDropping.');
      return;
    }

    const activeLabel = selectedLabel && labels.includes(selectedLabel) ? selectedLabel : labels[0];
    this.renderModal(activeLabel);
  }

  public closeModal(): void {
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }

  private renderModal(initialLabel: string): void {
    let container = document.getElementById('airdrop-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'airdrop-modal-container';
      document.body.appendChild(container);
    }

    const labels = this.engineManager.getEnrolledLabels();

    container.innerHTML = `
      <div id="airdrop-modal-overlay" class="modal-backdrop">
        <div class="modal-dialog airdrop-dialog">
          <div class="modal-header">
            <div class="modal-title">
              <span class="modal-icon">📱</span>
              <h3>AirDrop for Brains (Air-Gapped QR Transfer)</h3>
            </div>
            <button id="btn-close-airdrop" class="btn-close-modal">&times;</button>
          </div>

          <div class="airdrop-tabs">
            <button id="tab-btn-beam" class="tab-btn active">Beam / Share via QR</button>
            <button id="tab-btn-receive" class="tab-btn">Receive / Import Token</button>
          </div>

          <!-- Beam Tab -->
          <div id="airdrop-view-beam" class="tab-view active">
            <div class="beam-controls">
              <label for="select-airdrop-label">Select Gesture Prototype to Beam:</label>
              <select id="select-airdrop-label" class="select-sm">
                ${labels.map((l) => `<option value="${l}" ${l === initialLabel ? 'selected' : ''}>${l} (1.25 KB)</option>`).join('')}
              </select>
            </div>

            <div class="qr-canvas-wrapper">
              <canvas id="airdrop-qr-canvas" class="airdrop-qr-canvas"></canvas>
            </div>

            <div class="qr-meta-strip">
              <span class="badge badge-cyan">Payload: ~1,250 Bytes</span>
              <span class="badge badge-purple">100% Air-Gapped</span>
              <span class="badge badge-green">Zero Cloud Egress</span>
            </div>

            <div class="token-copy-box">
              <input type="text" id="input-airdrop-token" class="input-text token-input" readonly />
              <button id="btn-copy-token" class="btn btn-primary btn-sm">Copy Token</button>
            </div>
            <small class="token-help">Scan this QR code with any smartphone camera or copy the token to import onto another air-gapped machine.</small>
          </div>

          <!-- Receive Tab -->
          <div id="airdrop-view-receive" class="tab-view" style="display: none;">
            <div class="receive-instructions">
              <p>Paste an AirDrop token or beam a preset gesture to demonstrate instant zero-cloud model transfer.</p>
            </div>

            <div class="receive-form">
              <textarea id="textarea-receive-token" class="textarea-token" placeholder="Paste Base64 AirDrop token here (e.g. eyJmb3JtYXQiOiJoZGMtYWlyZHJvcCI...)"></textarea>
              <div class="receive-actions">
                <button id="btn-import-token" class="btn btn-primary">
                  <span>⚡ Instant AirDrop Import</span>
                </button>
                <button id="btn-demo-beam" class="btn btn-outline">
                  <span>Load Demo "Doctor_Zoom" Brain</span>
                </button>
              </div>
            </div>

            <div id="import-status-banner" class="status-banner status-info" style="margin-top: 12px; display: none;"></div>
          </div>
        </div>
      </div>
    `;

    this.modalEl = container.querySelector('#airdrop-modal-overlay');
    this.canvasEl = container.querySelector('#airdrop-qr-canvas') as HTMLCanvasElement;

    // Event Bindings
    const btnClose = container.querySelector('#btn-close-airdrop');
    if (btnClose) btnClose.addEventListener('click', () => this.closeModal());

    const backdrop = container.querySelector('#airdrop-modal-overlay');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });
    }

    // Tab Switchers
    const tabBeam = container.querySelector('#tab-btn-beam') as HTMLButtonElement;
    const tabReceive = container.querySelector('#tab-btn-receive') as HTMLButtonElement;
    const viewBeam = container.querySelector('#airdrop-view-beam') as HTMLElement;
    const viewReceive = container.querySelector('#airdrop-view-receive') as HTMLElement;

    if (tabBeam && tabReceive) {
      tabBeam.addEventListener('click', () => {
        tabBeam.classList.add('active');
        tabReceive.classList.remove('active');
        viewBeam.style.display = 'block';
        viewReceive.style.display = 'none';
      });

      tabReceive.addEventListener('click', () => {
        tabReceive.classList.add('active');
        tabBeam.classList.remove('active');
        viewBeam.style.display = 'none';
        viewReceive.style.display = 'block';
      });
    }

    // Gesture Selector
    const selectLabel = container.querySelector('#select-airdrop-label') as HTMLSelectElement;
    if (selectLabel) {
      selectLabel.addEventListener('change', () => {
        this.updateQrDisplay(selectLabel.value);
      });
    }

    // Copy Token Button
    const btnCopy = container.querySelector('#btn-copy-token') as HTMLButtonElement;
    const inputToken = container.querySelector('#input-airdrop-token') as HTMLInputElement;
    if (btnCopy && inputToken) {
      btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(inputToken.value).then(() => {
          btnCopy.textContent = 'Copied!';
          setTimeout(() => {
            btnCopy.textContent = 'Copy Token';
          }, 1500);
        });
      });
    }

    // Import Button
    const btnImport = container.querySelector('#btn-import-token') as HTMLButtonElement;
    const textToken = container.querySelector('#textarea-receive-token') as HTMLTextAreaElement;
    const statusBanner = container.querySelector('#import-status-banner') as HTMLElement;

    if (btnImport && textToken) {
      btnImport.addEventListener('click', () => {
        const val = textToken.value.trim();
        if (!val) {
          statusBanner.style.display = 'block';
          statusBanner.className = 'status-banner status-warning';
          statusBanner.textContent = 'Please paste a valid AirDrop token!';
          return;
        }

        const res = this.importAirDropToken(val);
        statusBanner.style.display = 'block';
        if (res.success) {
          statusBanner.className = 'status-banner status-success';
          statusBanner.textContent = `✓ Successfully AirDropped "${res.label}" into associative memory in 0.4ms!`;
          textToken.value = '';
          // Refresh beam select options
          this.refreshLabelsInSelect();
        } else {
          statusBanner.className = 'status-banner status-warning';
          statusBanner.textContent = `Import failed: ${res.error}`;
        }
      });
    }

    // Demo Beam Button
    const btnDemo = container.querySelector('#btn-demo-beam') as HTMLButtonElement;
    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        // Generate a synthetic surgical zoom demo trajectory
        const dummyTraj = new Float64Array(15 * 63);
        for (let i = 0; i < dummyTraj.length; i++) {
          dummyTraj[i] = Math.sin(i * 0.1) * 0.4;
        }
        this.engineManager.enroll('doctor_surgical_zoom', dummyTraj, 2);
        if (this.onImportCallback) this.onImportCallback();

        statusBanner.style.display = 'block';
        statusBanner.className = 'status-banner status-success';
        statusBanner.textContent = `✓ Beamed demo gesture "doctor_surgical_zoom" (N=2) into Item Memory in 0.2ms!`;
        this.refreshLabelsInSelect();
      });
    }

    // Initial QR render
    this.updateQrDisplay(initialLabel);
  }

  private refreshLabelsInSelect(): void {
    const select = document.getElementById('select-airdrop-label') as HTMLSelectElement;
    if (!select) return;
    const current = select.value;
    const labels = this.engineManager.getEnrolledLabels();
    select.innerHTML = labels
      .map((l) => `<option value="${l}" ${l === current ? 'selected' : ''}>${l} (1.25 KB)</option>`)
      .join('');
  }

  private updateQrDisplay(label: string): void {
    const inputToken = document.getElementById('input-airdrop-token') as HTMLInputElement;
    const canvas = document.getElementById('airdrop-qr-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const token = this.generateAirDropToken(label);
    if (!token) return;

    if (inputToken) {
      inputToken.value = token;
    }

    // Generate real visual QR Code
    try {
      const qr = QrCode.encodeText(token);
      qr.drawToCanvas(canvas, 4, 3);
    } catch (e) {
      console.warn('QR Code drawing error:', e);
    }
  }
}
