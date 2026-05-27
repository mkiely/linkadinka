import type { FoundLink } from '../types';
import { getOverrides, deleteOverride } from '../storage';
import { evaluateWithTrace } from '../patternMatcher';
import type { EvalTrace, OverrideEvalResult } from '../patternMatcher';

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

      <!-- ── Saved Overrides ── -->
      <section class="card" id="section-overrides">
        <div class="card-header">
          <h2>Saved Overrides</h2>
        </div>
        <div id="overrides-panel">
          ${buildOverridesPanelContent()}
        </div>
      </section>

      <!-- ── Found Links ── -->
      <section class="card" id="section-links">
        <div class="card-header">
          <h2>Found Links</h2>
          <span class="badge-count" id="selection-count">0 selected</span>
          <button class="btn btn-primary btn-create-overrides" id="btn-next" disabled>
            Create Overrides <span id="next-count"></span>
          </button>
        </div>
        <p class="section-hint">
          Links scanned from
          <a href="${import.meta.env.BASE_URL}samples/sample.html" target="_blank" rel="noopener">sample.html</a>
          and
          <a href="${import.meta.env.BASE_URL}samples/sample.txt" target="_blank" rel="noopener">sample.txt</a>.
          Select one or more, then click <strong>Create Overrides</strong>.
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
      </section>

    </div>
  `;
}

function buildLinkRow(link: FoundLink): string {
  const sourceLabel = link.sourceFile === 'html' ? '🌐 HTML' : '📄 Text';

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
      <td class="hash-cell">
        <code class="hash-chip">${esc(o.matcherHash ?? '—')}</code>
        <span class="badge ${o.hasWildcards ? 'badge-wildcard' : 'badge-exact'}">${o.hasWildcards ? 'wildcard' : 'exact'}</span>
      </td>
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
            <th>Matcher Hash / Type</th>
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

  const trace: EvalTrace = evaluateWithTrace(testUrl, overrides);

  const summaryClass = trace.matchedCount > 0 ? 'matched' : 'no-match';
  const summaryIcon = trace.matchedCount > 0 ? '✓' : '⊘';
  const summaryMsg = trace.matchedCount > 0
    ? `${trace.matchedCount} override${trace.matchedCount !== 1 ? 's' : ''} matched`
    : 'No matchers triggered';

  const overrideCards = trace.results.map(r => buildOverrideEvalCard(r)).join('');

  return `
    <div class="trace-header">
      <div class="trace-url-row">
        <span class="trace-label">Test URL</span>
        <code class="trace-url">${esc(testUrl)}</code>
      </div>
      <div class="trace-url-row">
        <span class="trace-label">URL hash</span>
        <code class="hash-chip">${esc(trace.testUrlHash)}</code>
        <span class="trace-hint">(djb2 of normalized URL — used for exact-match fast path)</span>
      </div>
    </div>

    <p class="tester-msg ${summaryClass}">${summaryIcon} ${summaryMsg} for <code>${esc(testUrl)}</code></p>

    <div class="eval-cards">${overrideCards}</div>

    <div class="trace-summary">
      <div class="trace-summary-row trace-summary-full">
        <span class="summary-row-label">Full scan</span>
        <span class="sep">·</span>
        <span>${trace.overridesEvaluated} override${trace.overridesEvaluated !== 1 ? 's' : ''} evaluated</span>
        <span class="sep">·</span>
        <span>${trace.exactHashChecks} exact-hash check${trace.exactHashChecks !== 1 ? 's' : ''}</span>
        <span class="sep">·</span>
        <span>${trace.patternTests} pattern test${trace.patternTests !== 1 ? 's' : ''}</span>
        <span class="sep">·</span>
        <strong>${trace.matchedCount} matched</strong>
        <span class="sep">·</span>
        <span>${trace.totalMs.toFixed(4)} ms</span>
        <span class="sep">·</span>
        <span>${trace.totalOps} ops</span>
      </div>
      ${buildShortCircuitRow(trace)}
    </div>`;
}

function buildOverrideEvalCard(r: OverrideEvalResult): string {
  const matched = r.matched;
  const cardClass = matched ? 'eval-card eval-card--match' : 'eval-card eval-card--no-match';
  const resultIcon = matched ? '✓' : '✗';
  const resultLabel = matched ? 'MATCH' : 'NO MATCH';

  const pathBadge: Record<OverrideEvalResult['path'], string> = {
    'exact-hash': '<span class="badge badge-hash-path">exact-hash</span>',
    'hash-mismatch': '<span class="badge badge-hash-path badge-mismatch">hash-mismatch</span>',
    'pattern-test': '<span class="badge badge-pattern-path">pattern-test</span>',
  };

  const stepRows = r.steps.map(step => {
    const iconMap: Record<typeof step.result, string> = {
      match: '✓',
      'no-match': '✗',
      skip: '–',
      info: 'ℹ',
    };
    const rowClass = `step-row step-${step.result}`;
    return `
      <tr class="${rowClass}">
        <td class="step-icon">${iconMap[step.result]}</td>
        <td class="step-label">${esc(step.label)}</td>
        <td class="step-detail"><code>${esc(step.detail)}</code></td>
        <td class="step-dur">${step.durationMs.toFixed(4)} ms</td>
        <td class="step-ops">${step.opsCount} op${step.opsCount !== 1 ? 's' : ''}</td>
      </tr>`;
  }).join('');

  return `
    <div class="${cardClass}">
      <div class="eval-card-header">
        <span class="eval-result-icon">${resultIcon}</span>
        <code class="eval-pattern">${esc(r.override.pattern.summary)}</code>
        <code class="hash-chip hash-chip--sm">${esc(r.override.matcherHash)}</code>
        <span class="badge ${r.override.hasWildcards ? 'badge-wildcard' : 'badge-exact'}">${r.override.hasWildcards ? 'wildcard' : 'exact'}</span>
        ${pathBadge[r.path]}
        <span class="eval-result-label ${matched ? 'result-match' : 'result-no-match'}">${resultLabel}</span>
      </div>
      <table class="steps-table">
        <thead>
          <tr>
            <th></th>
            <th>Step</th>
            <th>Detail</th>
            <th>Duration</th>
            <th>Ops</th>
          </tr>
        </thead>
        <tbody>${stepRows}</tbody>
        <tfoot>
          <tr class="step-total">
            <td colspan="3">Total</td>
            <td>${r.totalMs.toFixed(4)} ms</td>
            <td>${r.totalOps} ops</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function buildShortCircuitRow(trace: EvalTrace): string {
  const { shortCircuitMatchIndex, shortCircuitOps, shortCircuitMs, totalOps, totalMs, matchedCount } = trace;

  if (matchedCount === 0) {
    return `
      <div class="trace-summary-row trace-summary-sc trace-summary-sc--none">
        <span class="summary-row-label">Short-circuit</span>
        <span class="sep">·</span>
        <span class="sc-note">no match found — full scan required regardless</span>
      </div>`;
  }

  const savedOps = totalOps - shortCircuitOps;
  const savedMs  = totalMs  - shortCircuitMs;
  const atLabel  = `override ${shortCircuitMatchIndex + 1} of ${trace.overridesEvaluated}`;

  // Were there overrides after the match that were skipped?
  const hadTail = shortCircuitMatchIndex < trace.overridesEvaluated - 1;

  return `
    <div class="trace-summary-row trace-summary-sc trace-summary-sc--match">
      <span class="summary-row-label">Short-circuit</span>
      <span class="sep">·</span>
      <span>match at <strong>${atLabel}</strong></span>
      <span class="sep">·</span>
      <span class="sc-cost">${shortCircuitMs.toFixed(4)} ms</span>
      <span class="sep">·</span>
      <span class="sc-cost">${shortCircuitOps} ops</span>
      ${hadTail ? `
        <span class="sep">·</span>
        <span class="sc-saved">saved ${savedMs.toFixed(4)} ms &amp; ${savedOps} ops</span>
      ` : `<span class="sep">·</span><span class="sc-note">match was last — no savings</span>`}
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
