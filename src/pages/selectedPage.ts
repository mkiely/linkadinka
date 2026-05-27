import type { FoundLink, Override } from '../types';
import { openOverrideModal } from '../components/overrideModal';

type NavigateBack = () => void;
type OnOverrideSaved = (override: Override) => void;

export function renderSelectedPage(
  container: HTMLElement,
  selectedLinks: FoundLink[],
  navigateBack: NavigateBack,
  onOverrideSaved: OnOverrideSaved,
): void {
  container.innerHTML = `
    <div class="page-selected">
      <div class="page-toolbar">
        <button class="btn btn-back" id="btn-back">← Back to Links</button>
        <span class="selection-count">${selectedLinks.length} link${selectedLinks.length !== 1 ? 's' : ''} selected</span>
      </div>

      <section class="card">
        <h2>Selected Links</h2>
        <p class="section-hint">Click <strong>Create Override</strong> next to any link to define a URL redirect rule.</p>

        <div class="table-wrapper">
          <table class="links-table" id="selected-links-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Display Text</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${selectedLinks.map(link => buildRow(link)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  // Back button
  container.querySelector('#btn-back')?.addEventListener('click', navigateBack);

  // Create Override buttons
  container.querySelectorAll<HTMLButtonElement>('.btn-create-override').forEach(btn => {
    const linkId = btn.getAttribute('data-link-id');
    const link = selectedLinks.find(l => l.id === linkId);
    if (!link) return;

    btn.addEventListener('click', () => {
      openOverrideModal(link, (override) => {
        onOverrideSaved(override);
        // Visual feedback: mark row as having an override
        const row = container.querySelector(`tr[data-link-id="${link.id}"]`);
        row?.classList.add('has-override');
        btn.textContent = '✓ Override Saved';
        btn.disabled = true;
        btn.classList.add('btn-success');
      });
    });
  });
}

function buildRow(link: FoundLink): string {
  const sourceLabel = link.sourceFile === 'html' ? '🌐 HTML' : '📄 Text';
  const typeLabel = link.sourceType === 'anchor' ? 'anchor' : 'raw';
  return `
    <tr data-link-id="${link.id}">
      <td class="url-cell"><code class="url-code" title="${esc(link.rawUrl)}">${esc(link.rawUrl)}</code></td>
      <td class="text-cell">${link.displayText ? esc(link.displayText) : '<span class="muted">—</span>'}</td>
      <td><span class="badge badge-${link.sourceFile}">${sourceLabel} <small>(${typeLabel})</small></span></td>
      <td>
        <button class="btn btn-sm btn-create-override" data-link-id="${link.id}">
          Create Override
        </button>
      </td>
    </tr>`;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
