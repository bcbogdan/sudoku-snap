'use client';

import { useEffect, useState } from 'react';

// Keep local interactions usable while accepting subsequent Storybook Controls updates.
export function useStoryInput<T>(input: T) {
  const [value, setValue] = useState(input);
  useEffect(() => setValue(() => input), [input]);
  return [value, setValue] as const;
}
