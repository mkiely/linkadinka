import './style.css';
import type { FoundLink } from './types';
import { parseHtml, parseText } from './linkParser';
import { renderHomePage } from './pages/homePage';

// ─── App State ──────────────────────────────────────────────────────────────────
let allLinks: FoundLink[] = [];

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
  renderHomePage(app, allLinks);
}

// ─── Go ────────────────────────────────────────────────────────────────────────
boot();
