import type { ReactNode } from 'react';

export interface StoryFrameProps {
  children: ReactNode;
  width?: number;
}

export default function StoryFrame({ children, width = 1240 }: StoryFrameProps) {
  return (
    <main style={{ width: '100%', maxWidth: width, paddingTop: 24, paddingBottom: 24 }}>
      {children}
    </main>
  );
}
