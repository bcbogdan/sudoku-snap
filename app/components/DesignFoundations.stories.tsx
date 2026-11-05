import { useLayoutEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import './DesignFoundations.css';

const colors = [
  'paper',
  'card',
  'ink',
  'ink-2',
  'line',
  'peer',
  'pencil',
  'pencil-soft',
  'same-digit',
  'flash',
  'flash-soft',
  'completed',
  'completed-soft',
  'mistake',
  'mistake-soft',
] as const;

const pairs = [
  ['Body on paper', 'ink', 'paper'],
  ['Secondary on card', 'ink-2', 'card'],
  ['Entered digit', 'pencil', 'card'],
  ['Selected digit', 'pencil', 'pencil-soft'],
  ['Matching digit', 'pencil', 'same-digit'],
  ['Flash action', 'color-button-flash-text', 'color-button-flash-bg'],
  ['Unclear clue', 'ink', 'flash-soft'],
  ['Completed', 'completed', 'completed-soft'],
  ['Mistake', 'mistake', 'mistake-soft'],
] as const;

type FoundationProps = {
  theme: 'system' | 'light' | 'dark';
  palette: 'default' | 'alternate';
  section: 'all' | 'palette' | 'typography' | 'geometry' | 'contrast';
};

function DesignFoundations({ theme, palette, section }: FoundationProps) {
  const alternate = palette === 'alternate';
  const show = (name: FoundationProps['section']) => section === 'all' || section === name;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const originalTheme = root.getAttribute('data-theme');
    const originalPalette = root.getAttribute('data-palette');
    const originalStyle = root.getAttribute('style');
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = theme;
    if (alternate) {
      const dark =
        theme === 'dark' ||
        (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.palette = 'custom';
      root.style.setProperty('--palette-pencil', dark ? '#C4ADFF' : '#6542B5');
      root.style.setProperty('--palette-flash', '#F3A4DE');
      root.style.setProperty('--palette-completed', dark ? '#92E0DC' : '#256C68');
      root.style.setProperty('--palette-mistake', dark ? '#FFBCAF' : '#9B382D');
    }
    return () => {
      for (const [name, value] of [
        ['data-theme', originalTheme],
        ['data-palette', originalPalette],
        ['style', originalStyle],
      ] as const) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    };
  }, [theme, alternate]);

  return (
    <main
      className="design-foundations"
      data-theme={theme === 'system' ? undefined : theme}
      data-palette={palette}
    >
      <div className="foundation-intro">
        <p className="foundation-meta">DESIGN LANGUAGE / V0.3</p>
        <h1>Ink on paper</h1>
        <p>
          Foundation specimens · {theme} theme ·{' '}
          {alternate ? 'alternate main colors' : 'default palette'}
        </p>
      </div>

      {show('palette') && (
        <section aria-labelledby="foundation-palette" data-foundation="palette">
          <h2 id="foundation-palette">Palette</h2>
          <div className="foundation-swatches">
            {colors.map((color) => (
              <figure key={color}>
                <div
                  className="foundation-swatch"
                  data-token={color}
                  style={{ background: `var(--${color})` }}
                />
                <figcaption>{color}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {show('typography') && (
        <section aria-labelledby="foundation-typography" data-foundation="typography">
          <h2 id="foundation-typography">Typography</h2>
          <p className="foundation-meta">BRICOLAGE GROTESQUE / INTERFACE</p>
          <p className="foundation-heading" data-font="interface">
            My puzzles
          </p>
          <p className="foundation-title">Weekend puzzle</p>
          <p className="foundation-body">
            A quiet place to think. Scan a puzzle, check the clues, and make your next move.
          </p>
          <p className="foundation-meta">JETBRAINS MONO / DIGITS & METADATA</p>
          <div className="foundation-digit-row">
            <p className="foundation-clue" data-font="mono">
              123 456 789
            </p>
            <p className="foundation-entered">123 456 789</p>
          </div>
          <p className="foundation-timer">12:34</p>
          <p className="foundation-meta">MEDIUM · 32 CLUES · 48 MOVES</p>
        </section>
      )}

      {show('geometry') && (
        <section aria-labelledby="foundation-geometry" data-foundation="geometry">
          <h2 id="foundation-geometry">Spacing, radii & strokes</h2>
          <h3>Spacing scale</h3>
          <div className="foundation-spacing">
            {[
              [4, '1'],
              [8, '2'],
              [12, '3'],
              [16, '4'],
              [24, '6'],
              [32, '8'],
            ].map(([size, token]) => (
              <div key={size}>
                <code>{size}</code>
                <span style={{ width: `var(--space-${token})`, height: `var(--space-${token})` }} />
              </div>
            ))}
          </div>
          <h3>Corner radii</h3>
          <div className="foundation-radii">
            {[
              [0, 'none'],
              [8, 'sm'],
              [14, 'md'],
              [20, 'lg'],
            ].map(([radius, token]) => (
              <div key={radius} style={{ borderRadius: `var(--radius-${token})` }}>
                <code>{radius}px</code>
              </div>
            ))}
          </div>
          <h3>Board strokes</h3>
          <div className="foundation-strokes">
            {[
              ['Cell', 1, 'thin'],
              ['Box', 2, 'box'],
              ['Outer frame', 3, 'frame'],
            ].map(([label, width, token]) => (
              <div key={label}>
                <span style={{ borderTopWidth: `var(--border-${token})` }} />
                <code>
                  {label} / {width}px
                </code>
              </div>
            ))}
          </div>
          <h3>Control targets</h3>
          <div className="foundation-targets">
            <span>44px minimum</span>
            <span>52px standard</span>
          </div>
        </section>
      )}

      {show('contrast') && (
        <section aria-labelledby="foundation-contrast" data-foundation="contrast">
          <h2 id="foundation-contrast">Semantic contrast pairs</h2>
          <p>
            Text must remain readable when main colors change. Color never carries the label alone.
          </p>
          <div className="foundation-pairs">
            {pairs.map(([label, foreground, background]) => (
              <div
                key={label}
                className="foundation-pair"
                data-contrast-pair={label}
                style={{ color: `var(--${foreground})`, background: `var(--${background})` }}
              >
                <strong>{label}</strong>
                <span>
                  {foreground} / {background}
                </span>
              </div>
            ))}
          </div>
          <button className="foundation-focus" type="button">
            Keyboard focus specimen
          </button>
        </section>
      )}
    </main>
  );
}

const meta = {
  title: 'Design/Foundations',
  component: DesignFoundations,
  args: { theme: 'system', palette: 'default', section: 'all' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DesignFoundations>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = { args: { section: 'palette' } };
export const Typography: Story = { args: { section: 'typography' } };
export const Geometry: Story = { args: { section: 'geometry' } };
export const SemanticPairs: Story = { args: { section: 'contrast' } };
export const ForcedLight: Story = { args: { theme: 'light' } };
export const ForcedDark: Story = { args: { theme: 'dark' } };
export const AlternatePalette: Story = { args: { palette: 'alternate' } };
export const AlternatePaletteDark: Story = {
  args: { theme: 'dark', palette: 'alternate' },
};
