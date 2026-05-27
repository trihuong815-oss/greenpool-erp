'use client';

import { Building2 } from 'lucide-react';
import type { BranchRevenue } from '../types';
import { BranchRevenueCard } from './BranchRevenueCard';

interface Props {
  branches: BranchRevenue[];
  selectedBranchId?: string | null;
  onSelect?: (branchId: string) => void;
  emptyText?: string;
}

export function BranchRevenueGrid({ branches, selectedBranchId, onSelect, emptyText }: Props) {
  if (branches.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
        <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
        <p className="text-sm text-slate-600">
          {emptyText || 'Bạn không có cơ sở nào trong phạm vi quyền.'}
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-slate-800">Doanh thu theo cơ sở</h2>
        <span className="text-xs text-slate-500">({branches.length})</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {branches.map(b => (
          <BranchRevenueCard
            key={b.branchId}
            data={b}
            selected={selectedBranchId === b.branchId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
