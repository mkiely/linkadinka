import './style.css';
import type { FoundLink } from './types';
import { parseHtml, parseText } from './linkParser';
import { renderHomePage, refreshOverridesPanel } from './pages/homePage';
import { renderSelectedPage } from './pages/selectedPage';

// ─── App State ──────────────────────────────────────────────────────────────────
let allLinks: FoundLink[] = [];
let selectedLinks: FoundLink[] = [];

// ─── Bootstrap ─────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p class="loading">⏳ Loading sample files…</p>';

  try {
    const base = import.meta.env.BASE_URL;
    const [htmlRes, txtRes] = await Promise.all([
      fetch(`${base}samples/sample.html`),
      fetch(`${base}samples/sample.txt`),
    ]);

    if (!htmlRes.ok || !txtRes.ok) {
      throw new Error('Could not load sample files. Run `npm run generate` first.');
    }

    const [htmlContent, txtContent] = await Promise.all([
      htmlRes.text(),
      txtRes.text(),
    ]);

    const htmlLinks = parseHtml(htmlContent);
    const txtLinks = parseText(txtContent);
    allLinks = [...htmlLinks, ...txtLinks];

  } catch (err) {
    app.innerHTML = `
      <div class="error-state card">
        <h2>⚠️ Could not load sample files</h2>
        <p>Run <code>npm run generate</code> in the project root to generate the sample files, then refresh.</p>
        <details><summary>Error details</summary><pre>${String(err)}</pre></details>
      </div>`;
    return;
  }

  goHome();
}

// ─── Navigation ─────────────────────────────────────────────────────────────────
function goHome(): void {
  const app = document.getElementById('app')!;
  renderHomePage(app, allLinks, (selected) => {
    selectedLinks = selected;
    goSelected();
  });
}

function goSelected(): void {
  const app = document.getElementById('app')!;
  renderSelectedPage(app, selectedLinks, goHome, (_override) => {
    // After an override is saved, refresh the overrides panel if we ever go back home.
    // We also want the home page (when re-rendered) to pick it up from localStorage automatically.
    // For now just schedule a refresh if the user goes back.
    // The refreshOverridesPanel is exported for use on the home page after navigation back.
    void _override;
  });
}

// Expose refresh for the selected page's onSave callback to work with home page panel
// (home page will re-render from scratch on back navigation, so localStorage is always fresh)
export { refreshOverridesPanel };

// ─── Go ────────────────────────────────────────────────────────────────────────
boot();
