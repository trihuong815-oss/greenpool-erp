'use client';

// Context để AppTopBar (component con) trigger mở/đóng sidebar drawer
// state thuộc AppShell (component cha). Tách context vì layout.tsx là Server Component
// không hold được state.

import { createContext, useContext } from 'react';

interface MobileNavContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

export const MobileNavContext = createContext<MobileNavContextValue>({
  open: false,
  setOpen: () => {},
});

export function useMobileNav() {
  return useContext(MobileNavContext);
}
