'use client';

// Cung cấp thông tin tài khoản cho UI góc trên phải (UserMenu) ở mọi trang
// dùng AppTopBar — mà không phải truyền prop qua từng page.
// Provider đặt ở AppShell (đã có sẵn profile).

import { createContext, useContext, type ReactNode } from 'react';

export interface AccountInfo {
  userName: string;
  userRole: string;
  roleCode: string;
  avatarUrl?: string | null;
}

const AccountContext = createContext<AccountInfo | null>(null);

export function AccountProvider({ value, children }: { value: AccountInfo; children: ReactNode }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Trả về thông tin tài khoản; null nếu render ngoài AppShell (an toàn). */
export function useAccount(): AccountInfo | null {
  return useContext(AccountContext);
}
