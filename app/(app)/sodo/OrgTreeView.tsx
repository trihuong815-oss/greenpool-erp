'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Role, Profile } from '@/lib/types';

const HIDDEN_ROLE_CODES = new Set(['NV_AS']);

interface TreeNode {
  role: Role;
  children: TreeNode[];
}

interface Props {
  roles: Role[];
  profiles: Profile[];
  onSelectRole: (role: Role) => void;
}

function buildTree(roles: Role[]): TreeNode | null {
  const visibleRoles = roles.filter(r => !HIDDEN_ROLE_CODES.has(r.code));
  const map = new Map<string, TreeNode>();
  visibleRoles.forEach(r => map.set(r.code, { role: r, children: [] }));

  let root: TreeNode | null = null;

  // Tìm parent thực tế cho mỗi role
  function findParentCode(r: Role): string | null {
    if (r.parent_role && map.has(r.parent_role)) return r.parent_role;
    if (r.tier === 1) return null;
    // Fallback: tìm role ở tier thấp hơn (gần) cùng dept_id
    if (r.dept_id) {
      for (let t = r.tier - 1; t >= 1; t--) {
        const candidate = visibleRoles.find(x => x.tier === t && x.dept_id === r.dept_id);
        if (candidate) return candidate.code;
      }
    }
    // Fallback cuối: gắn về GĐ Khối tương ứng
    if (r.block_id === 'KD') return 'GD_KD';
    if (r.block_id === 'VP') return 'GD_VP';
    if (r.tier > 1) return 'CEO';
    return null;
  }

  visibleRoles.forEach(r => {
    const node = map.get(r.code)!;
    const parentCode = findParentCode(r);
    if (parentCode && map.has(parentCode) && parentCode !== r.code) {
      map.get(parentCode)!.children.push(node);
    } else if (r.tier === 1) {
      root = node;
    }
  });

  // Sort children: theo tier asc, dept_id, code
  function sortChildren(n: TreeNode) {
    n.children.sort((a, b) => {
      if (a.role.tier !== b.role.tier) return a.role.tier - b.role.tier;
      const da = a.role.dept_id || '￿';
      const db = b.role.dept_id || '￿';
      if (da !== db) return da.localeCompare(db);
      return a.role.code.localeCompare(b.role.code);
    });
    n.children.forEach(sortChildren);
  }
  if (root) sortChildren(root);
  return root;
}

function colorByRole(role: Role): { box: string; accent: string } {
  if (role.tier === 1) return { box: 'bg-rose-50 border-rose-500', accent: 'text-rose-700' };
  if (role.block_id === 'KD') return { box: 'bg-blue-50 border-blue-500', accent: 'text-blue-700' };
  if (role.block_id === 'VP') return { box: 'bg-emerald-50 border-emerald-500', accent: 'text-emerald-700' };
  return { box: 'bg-slate-50 border-slate-400', accent: 'text-slate-600' };
}

export function OrgTreeView({ roles, profiles, onSelectRole }: Props) {
  const tree = useMemo(() => buildTree(roles), [roles]);

  const countByRole = useMemo(() => {
    const m: Record<string, number> = {};
    profiles.forEach(p => { m[p.role_code] = (m[p.role_code] || 0) + 1; });
    return m;
  }, [profiles]);

  // Expand state: tier 1-3 mặc định mở
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    roles.forEach(r => { if (r.tier <= 3) s.add(r.code); });
    return s;
  });

  function toggle(code: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code); else n.add(code);
      return n;
    });
  }

  function expandAll() {
    setExpanded(new Set(roles.map(r => r.code)));
  }
  function collapseAll() {
    setExpanded(new Set(roles.filter(r => r.tier === 1).map(r => r.code)));
  }

  if (!tree) return (
    <div className="card text-center py-8 text-slate-500">
      Không tìm thấy gốc cây (CEO). Kiểm tra dữ liệu roles.
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-600">
            Click vào ô vai trò để xem chi tiết. Click mũi tên ▸ để mở/đóng cấp dưới.
          </div>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-xs px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
              ▾ Mở toàn bộ
            </button>
            <button onClick={collapseAll} className="text-xs px-3 py-1.5 border border-slate-200 rounded hover:bg-slate-50">
              ▸ Thu gọn
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto bg-gradient-to-b from-slate-50 to-white">
        <div className="org-tree min-w-fit py-6 px-4 flex justify-center">
          <TreeNodeView node={tree} expanded={expanded} onToggle={toggle}
            onSelect={onSelectRole} countByRole={countByRole} isRoot />
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span className="font-semibold text-slate-700">Chú thích:</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-rose-50 border-2 border-rose-500"></span> Lãnh đạo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-50 border-2 border-blue-500"></span> Khối Kinh doanh
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-50 border-2 border-emerald-500"></span> Khối Văn phòng
          </span>
        </div>
      </div>
    </div>
  );
}

type SiblingPos = 'only' | 'first' | 'middle' | 'last';

interface NodeViewProps {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (code: string) => void;
  onSelect: (role: Role) => void;
  countByRole: Record<string, number>;
  isRoot?: boolean;
  sibling?: SiblingPos;
}

function TreeNodeView({ node, expanded, onToggle, onSelect, countByRole, isRoot, sibling = 'only' }: NodeViewProps) {
  const isOpen = expanded.has(node.role.code);
  const hasChildren = node.children.length > 0;
  const colors = colorByRole(node.role);
  const count = countByRole[node.role.code] || 0;

  // Mỗi child tự vẽ nửa đoạn ngang theo vị trí siblings:
  // - first: từ giữa cột sang phải
  // - last:  từ trái sang giữa cột
  // - middle: full width
  // - only: không vẽ (chỉ có 1 con → chỉ cần vertical line)
  const horizontalBarCls =
    sibling === 'first' ? 'left-1/2 right-0' :
    sibling === 'last'  ? 'left-0 right-1/2' :
    sibling === 'middle'? 'left-0 right-0'   : '';

  return (
    <div className={`flex flex-col items-center relative ${isRoot ? '' : 'px-3'}`}>
      {/* Đoạn ngang (chỉ vẽ khi node có anh em ruột) */}
      {!isRoot && sibling !== 'only' && (
        <div className={`absolute top-0 h-px bg-slate-300 ${horizontalBarCls}`} aria-hidden />
      )}
      {/* Đoạn dọc từ bar ngang xuống node hiện tại */}
      {!isRoot && (
        <div className="w-px h-6 bg-slate-300" aria-hidden />
      )}

      {/* Node box */}
      <div className="relative inline-block">
        <button
          onClick={() => onSelect(node.role)}
          className={`block px-3 py-2 rounded-lg border-2 ${colors.box} shadow-sm hover:shadow-md transition text-center min-w-[140px] max-w-[180px]`}
        >
          <div className="font-semibold text-slate-800 text-sm leading-tight">{node.role.name}</div>
          <div className={`text-[10px] font-mono mt-0.5 ${colors.accent}`}>{node.role.code}</div>
          {count > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded text-[10px] font-semibold text-slate-700 border border-slate-200">
              👥 {count}
            </div>
          )}
        </button>
        {hasChildren && (
          <button onClick={() => onToggle(node.role.code)}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10 w-5 h-5 rounded-full bg-white border-2 border-slate-400 flex items-center justify-center hover:bg-slate-100 shadow-sm"
            title={isOpen ? 'Thu gọn' : 'Mở rộng'}>
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {/* Children: không dùng gap; mỗi child tự có px-3 để các đoạn ngang liền nhau */}
      {isOpen && hasChildren && (
        <>
          <div className="w-px h-6 bg-slate-300" aria-hidden />
          <div className="flex items-start">
            {node.children.map((child, i) => {
              const pos: SiblingPos =
                node.children.length === 1 ? 'only'
                : i === 0 ? 'first'
                : i === node.children.length - 1 ? 'last'
                : 'middle';
              return (
                <TreeNodeView key={child.role.code} node={child}
                  expanded={expanded} onToggle={onToggle} onSelect={onSelect}
                  countByRole={countByRole} sibling={pos} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
