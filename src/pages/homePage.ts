import type { FoundLink, Override } from '../types';
import { getOverrides, deleteOverride } from '../storage';
import { findMatchingOverrides } from '../patternMatcher';

type NavigateToSelected = (selected: FoundLink[]) => void;

export function renderHomePage(
  container: HTMLElement,
  allLinks: FoundLink[],
  navigateToSelected: NavigateToSelected,
): void {
  container.innerHTML = buildHomeHtml(allLinks);
  wireHomePage(container, allLinks, navigateToSelected);
}

// Re-render only the overrides panel (called after saving a new override)
export function refreshOverridesPanel(container: HTMLElement): void {
  const panel = container.querySelector('#overrides-panel');
  if (panel) panel.innerHTML = buildOverridesPanelContent();
  wireDeleteButtons(container);
}

// ─── Build HTML ────────────────────────────────────────────────────────────────

function buildHomeHtml(allLinks: FoundLink[]): string {
  return `
    <div class="page-home">
      <!-- ── Found Links ── -->
      <section class="card" id="section-links">
        <div class="card-header">
          <h2>Found Links</h2>
          <span class="badge-count" id="selection-count">0 selected</span>
        </div>
        <p class="section-hint">
          Links scanned from <code>sample.html</code> and <code>sample.txt</code>.
          Select one or more, then click <strong>Next</strong> to create overrides.
        </p>

        <div class="table-wrapper">
          <table class="links-table" id="links-table">
            <thead>
              <tr>
                <th class="col-check">
                  <input type="checkbox" id="select-all" title="Select all" />
                </th>
                <th>URL</th>
                <th>Display Text</th>
                <th>Source</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              ${allLinks.map(link => buildLinkRow(link)).join('')}
            </tbody>
          </table>
        </div>

        <div class="table-actions">
          <button class="btn btn-primary" id="btn-next" disabled>
            Next → <span id="next-count"></span>
          </button>
        </div>
      </section>

      <!-- ── Saved Overrides ── -->
      <section class="card" id="section-overrides">
        <div class="card-header">
          <h2>Saved Overrides</h2>
        </div>
        <div id="overrides-panel">
          ${buildOverridesPanelContent()}
        </div>
      </section>

      <!-- ── URL Tester ── -->
      <section class="card" id="section-tester">
        <div class="card-header">
          <h2>Test URL Matcher</h2>
        </div>
        <p class="section-hint">Enter a URL to see which saved overrides would match it.</p>
        <div class="tester-form">
          <input
            type="text"
            id="test-url-input"
            class="test-url-input"
            placeholder="https://www.example.com/search?q=boots"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn btn-primary" id="btn-test">Test</button>
        </div>
        <div id="tester-results"></div>
      </section>
    </div>
  `;
}

function buildLinkRow(link: FoundLink): string {
  const sourceLabel = link.sourceFile === 'html' ? '🌐 HTML' : '📄 Text';
  const typeLabel = link.sourceType === 'anchor' ? 'anchor' : 'raw';

  // Classify the link visually
  const isFullHbs = /^\{\{[^}]+\}\}$/.test(link.rawUrl.trim());
  const hasHbs = /\{\{[^}]+\}\}/.test(link.rawUrl);
  const hasQuery = link.rawUrl.includes('?');

  let typeBadge: string;
  if (isFullHbs) typeBadge = '<span class="badge badge-hbs-full">full template</span>';
  else if (hasHbs && hasQuery) typeBadge = '<span class="badge badge-hbs">hbs + params</span>';
  else if (hasHbs) typeBadge = '<span class="badge badge-hbs">handlebars</span>';
  else if (hasQuery) typeBadge = '<span class="badge badge-query">query params</span>';
  else typeBadge = '<span class="badge badge-plain">plain</span>';

  return `
    <tr data-link-id="${link.id}">
      <td class="col-check">
        <input type="checkbox" class="row-check" data-link-id="${link.id}" />
      </td>
      <td class="url-cell"><code class="url-code" title="${esc(link.rawUrl)}">${esc(link.rawUrl)}</code></td>
      <td class="text-cell">${link.displayText ? esc(link.displayText) : '<span class="muted">—</span>'}</td>
      <td><span class="badge badge-${link.sourceFile}">${sourceLabel}</span></td>
      <td>${typeBadge}</td>
    </tr>`;
}

function buildOverridesPanelContent(): string {
  const overrides = getOverrides();
  if (overrides.length === 0) {
    return `<p class="empty-state">No overrides saved yet. Select links above and create overrides.</p>`;
  }

  const rows = overrides.map(o => `
    <tr data-override-id="${o.id}">
      <td class="pattern-cell"><code>${esc(o.pattern.summary)}</code></td>
      <td class="dest-cell"><code>${esc(o.destination)}</code></td>
      <td class="date-cell"><span class="muted">${new Date(o.createdAt).toLocaleString()}</span></td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete-override" data-override-id="${o.id}">
          Delete
        </button>
      </td>
    </tr>`).join('');

  return `
    <div class="table-wrapper">
      <table class="overrides-table">
        <thead>
          <tr>
            <th>Pattern</th>
            <th>Destination</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildTesterResults(testUrl: string): string {
  const overrides = getOverrides();
  if (overrides.length === 0) {
    return `<p class="tester-msg muted">No overrides saved yet to test against.</p>`;
  }
  const matches = findMatchingOverrides(testUrl, overrides);
  if (matches.length === 0) {
    return `<p class="tester-msg no-match">⊘ No matchers triggered for <code>${esc(testUrl)}</code></p>`;
  }
  const rows = matches.map(m => `
    <tr>
      <td><code>${esc(m.pattern.summary)}</code></td>
      <td><code>${esc(m.destination)}</code></td>
    </tr>`).join('');
  return `
    <p class="tester-msg matched">✓ ${matches.length} override${matches.length !== 1 ? 's' : ''} matched <code>${esc(testUrl)}</code></p>
    <div class="table-wrapper">
      <table class="overrides-table match-table">
        <thead><tr><th>Matched Pattern</th><th>→ Destination</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Wire Up Events ────────────────────────────────────────────────────────────

function wireHomePage(
  container: HTMLElement,
  allLinks: FoundLink[],
  navigateToSelected: NavigateToSelected,
): void {
  const btnNext = container.querySelector<HTMLButtonElement>('#btn-next')!;
  const nextCount = container.querySelector<HTMLElement>('#next-count')!;
  const selectionCount = container.querySelector<HTMLElement>('#selection-count')!;
  const selectAll = container.querySelector<HTMLInputElement>('#select-all')!;

  function updateSelectionState(): void {
    const checked = container.querySelectorAll<HTMLInputElement>('.row-check:checked');
    const n = checked.length;
    btnNext.disabled = n === 0;
    nextCount.textContent = n > 0 ? `(${n})` : '';
    selectionCount.textContent = `${n} selected`;
    // Update select-all indeterminate state
    const total = allLinks.length;
    selectAll.checked = n === total;
    selectAll.indeterminate = n > 0 && n < total;
  }

  // Row checkboxes
  container.querySelectorAll<HTMLInputElement>('.row-check').forEach(chk => {
    chk.addEventListener('change', updateSelectionState);
  });

  // Select-all
  selectAll.addEventListener('change', () => {
    container.querySelectorAll<HTMLInputElement>('.row-check').forEach(chk => {
      chk.checked = selectAll.checked;
    });
    updateSelectionState();
  });

  // Next button
  btnNext.addEventListener('click', () => {
    const checkedIds = new Set(
      [...container.querySelectorAll<HTMLInputElement>('.row-check:checked')]
        .map(el => el.getAttribute('data-link-id')!),
    );
    const selected = allLinks.filter(l => checkedIds.has(l.id));
    navigateToSelected(selected);
  });

  // Delete override buttons
  wireDeleteButtons(container);

  // URL Tester
  const testInput = container.querySelector<HTMLInputElement>('#test-url-input')!;
  const btnTest = container.querySelector<HTMLButtonElement>('#btn-test')!;
  const testerResults = container.querySelector<HTMLElement>('#tester-results')!;

  function runTest(): void {
    const val = testInput.value.trim();
    if (!val) {
      testerResults.innerHTML = '';
      return;
    }
    testerResults.innerHTML = buildTesterResults(val);
  }

  btnTest.addEventListener('click', runTest);
  testInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runTest();
  });
}

function wireDeleteButtons(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('.btn-delete-override').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-override-id');
      if (!id) return;
      if (!confirm('Delete this override?')) return;
      deleteOverride(id);
      refreshOverridesPanel(container);
    });
  });
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
