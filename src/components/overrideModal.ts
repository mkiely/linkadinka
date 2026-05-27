import type { FoundLink, Override, UrlSegment } from '../types';
import { analyzeUrl, buildPatternSummary } from '../urlAnalyzer';
import { saveOverride } from '../storage';

type OnSaveCallback = (override: Override) => void;

let modalEl: HTMLElement | null = null;

export function openOverrideModal(link: FoundLink, onSave: OnSaveCallback): void {
  closeOverrideModal();

  const segments = analyzeUrl(link.rawUrl);
  const root = document.getElementById('modal-root')!;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Create URL Override');

  overlay.innerHTML = buildModalHtml(link, segments);
  root.appendChild(overlay);
  modalEl = overlay;

  // Wire up close / cancel
  overlay.querySelector('.modal-close')?.addEventListener('click', closeOverrideModal);
  overlay.querySelector('.btn-cancel')?.addEventListener('click', closeOverrideModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverrideModal();
  });

  // Wire up wildcard toggles — disable/enable the value input
  overlay.querySelectorAll<HTMLInputElement>('.seg-wildcard').forEach(chk => {
    const row = chk.closest('.seg-row')!;
    const input = row.querySelector<HTMLInputElement>('.seg-value');
    if (!input) return;
    updateSegmentInput(input, chk.checked);
    chk.addEventListener('change', () => updateSegmentInput(input, chk.checked));
  });

  // Save button
  overlay.querySelector('.btn-save')?.addEventListener('click', () => {
    handleSave(link, segments, overlay, onSave);
  });

  // Focus first focusable element
  (overlay.querySelector('input, button') as HTMLElement | null)?.focus();
}

function updateSegmentInput(input: HTMLInputElement, isWildcard: boolean): void {
  input.disabled = isWildcard;
  input.placeholder = isWildcard ? '(wildcard — matches any value)' : 'exact match value';
  if (isWildcard) input.value = '';
}

function buildModalHtml(link: FoundLink, segments: UrlSegment[]): string {
  const isFullHbs = /^\{\{[^}]+\}\}$/.test(link.rawUrl.trim());
  const hasSegments = segments.length > 0;

  const segmentRows = segments.map((seg, i) => {
    const labelText = seg.kind === 'handlebars'
      ? `{{${seg.label}}} (path)`
      : `?${seg.label}= (query param)`;

    return `
      <tr class="seg-row" data-index="${i}">
        <td class="seg-label"><code>${esc(labelText)}</code></td>
        <td>
          <input
            type="text"
            class="seg-value"
            data-index="${i}"
            value="${esc(seg.value)}"
            ${seg.isWildcard ? 'disabled' : ''}
            placeholder="${seg.isWildcard ? '(wildcard — matches any value)' : 'exact match value'}"
          />
        </td>
        <td class="seg-wildcard-cell">
          <label class="toggle-label">
            <input
              type="checkbox"
              class="seg-wildcard"
              data-index="${i}"
              ${seg.isWildcard ? 'checked' : ''}
            />
            Wildcard
          </label>
        </td>
      </tr>`;
  }).join('');

  const patternBody = !hasSegments
    ? `<p class="no-segments">This URL has no dynamic parts — the pattern will match this URL exactly.</p>`
    : `<table class="seg-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Match Value</th>
            <th>Wildcard?</th>
          </tr>
        </thead>
        <tbody>${segmentRows}</tbody>
      </table>`;

  const fullHbsNote = isFullHbs
    ? `<p class="hbs-note">⚡ This link's entire URL is a template variable. You can match any URL or specify an exact value below.</p>`
    : '';

  return `
    <div class="modal-card">
      <div class="modal-header">
        <h2>Create URL Override</h2>
        <button class="modal-close" aria-label="Close modal">✕</button>
      </div>

      <div class="modal-body">
        <div class="source-url-block">
          <span class="label">Source URL</span>
          <code class="source-url">${esc(link.rawUrl)}</code>
        </div>

        ${fullHbsNote}

        <section class="modal-section">
          <h3>Matching Pattern</h3>
          <p class="section-hint">Set which parts of the URL must match exactly, and which can be anything (wildcard).</p>
          ${patternBody}
        </section>

        <section class="modal-section">
          <h3>Override Destination</h3>
          <p class="section-hint">The URL to route matching requests to. Must include protocol (http:// or https://).</p>
          <input
            type="url"
            class="destination-input"
            placeholder="https://your-override-destination.com/..."
            autocomplete="off"
            spellcheck="false"
          />
          <p class="dest-error hidden" role="alert"></p>
        </section>
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel">Cancel</button>
        <button class="btn btn-primary btn-save">Save Override</button>
      </div>
    </div>`;
}

function handleSave(
  link: FoundLink,
  initialSegments: UrlSegment[],
  overlay: HTMLElement,
  onSave: OnSaveCallback,
): void {
  // Read current segment values from the form
  const segments: UrlSegment[] = initialSegments.map((seg, i) => {
    const wildcardEl = overlay.querySelector<HTMLInputElement>(`.seg-wildcard[data-index="${i}"]`);
    const valueEl = overlay.querySelector<HTMLInputElement>(`.seg-value[data-index="${i}"]`);
    const isWildcard = wildcardEl?.checked ?? seg.isWildcard;
    const value = isWildcard ? '' : (valueEl?.value.trim() ?? seg.value);
    return { ...seg, isWildcard, value };
  });

  // Validate destination
  const destInput = overlay.querySelector<HTMLInputElement>('.destination-input')!;
  const destError = overlay.querySelector<HTMLElement>('.dest-error')!;
  const destination = destInput.value.trim();

  let valid = true;
  if (!destination) {
    showDestError(destError, 'Destination URL is required.');
    valid = false;
  } else if (!/^https?:\/\/.+/.test(destination)) {
    showDestError(destError, 'Must be a valid URL starting with http:// or https://');
    valid = false;
  } else {
    try {
      new URL(destination);
      destError.classList.add('hidden');
    } catch {
      showDestError(destError, 'Not a valid URL. Check the format and try again.');
      valid = false;
    }
  }

  if (!valid) return;

  const override: Override = {
    id: `override-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceUrl: link.rawUrl,
    pattern: {
      segments,
      summary: buildPatternSummary(link.rawUrl, segments),
    },
    destination,
    createdAt: Date.now(),
  };

  saveOverride(override);
  onSave(override);
  closeOverrideModal();
}

function showDestError(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function closeOverrideModal(): void {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
