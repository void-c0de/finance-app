import { create } from 'zustand';

import { STANDARD_ACCESS, type ProductAccess } from '@/services/entitlementCore';
import { getCachedProductAccess, refreshProductAccess } from '@/services/productAccess';

type ProductAccessState = {
  access: ProductAccess;
  isLoading: boolean;
  hydrate(): Promise<void>;
  refresh(): Promise<void>;
  setAccess(access: ProductAccess): void;
};

export const useProductAccessStore = create<ProductAccessState>((set) => ({
  access: STANDARD_ACCESS,
  isLoading: true,
  async hydrate() {
    set({ access: await getCachedProductAccess(), isLoading: false });
  },
  async refresh() {
    set({ isLoading: true });
    set({ access: await refreshProductAccess(), isLoading: false });
  },
  setAccess(access) {
    set({ access, isLoading: false });
  },
}));
