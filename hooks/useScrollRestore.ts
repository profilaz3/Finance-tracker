import { useRef } from 'react';
import { View } from '../types';

export function useScrollRestore() {
  const positions = useRef<Partial<Record<View, number>>>({});

  const save = (view: View, scrollTop: number) => {
    positions.current[view] = scrollTop;
  };

  const get = (view: View) => positions.current[view] || 0;

  return { save, get };
}
