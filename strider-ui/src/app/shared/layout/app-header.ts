import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
  <svg
    class="logo"
    aria-hidden="true"
    width="36"
    height="36"
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="512" height="512" rx="118" fill="var(--color-accent)" />
    <!-- 20x20 icon scaled 16x = 320px, centered: (512 - 320) / 2 = 96 -->
    <g transform="translate(96 96) scale(16)">
      <path
        fill="white"
        d="M17.545 15.467l-3.779-3.779a6.15 6.15 0 0 0 .898-3.21c0-3.417-2.961-6.377-6.378-6.377A6.185 6.185 0 0 0 2.1 8.287c0 3.416 2.961 6.377 6.377 6.377a6.15 6.15 0 0 0 3.115-.844l3.799 3.801a.953.953 0 0 0 1.346 0l.943-.943c.371-.371.236-.84-.135-1.211zM4.004 8.287a4.282 4.282 0 0 1 4.282-4.283c2.366 0 4.474 2.107 4.474 4.474a4.284 4.284 0 0 1-4.283 4.283c-2.366-.001-4.473-2.109-4.473-4.474z"
      />
    </g>
  </svg>
  <span class="wordmark">Strider</span>
  <span class="tagline">Distributed Trace Explorer</span>
</header>
  `,
  styles: [
    `
      .header {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4) var(--space-6);
        border-bottom: 1px solid var(--color-border);
      }

      .logo {
        flex-shrink: 0;
      }

      .wordmark {
        font-family: var(--font-display);
        font-size: var(--fs-xl);
        font-weight: 700;
        color: var(--color-text);
        letter-spacing: -0.02em;
      }

      .tagline {
        font-size: var(--fs-sm);
        color: var(--color-dim);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
    `,
  ],
})
export class AppHeader { }
