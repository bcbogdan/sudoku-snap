export interface AppHeaderProps {
  screen: 'library' | 'create' | 'review' | 'detail' | 'play';
}

export default function AppHeader({ screen }: AppHeaderProps) {
  return (
    <header>
      <a href="/" className="brand">
        <span aria-hidden="true">▦</span> Sudoku Snap
      </a>
      <nav>
        <a href="/" aria-current={screen === 'library' ? 'page' : undefined}>
          My puzzles
        </a>
        <a href="/?new" aria-current={screen === 'create' ? 'page' : undefined}>
          New puzzle
        </a>
      </nav>
    </header>
  );
}
