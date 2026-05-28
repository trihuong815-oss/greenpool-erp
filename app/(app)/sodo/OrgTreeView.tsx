'use client';

// Sơ đồ cây tổ chức — SVG layout với Bezier connections, 3D card design.
// - Tính position cards bằng leaf-count, vẽ connections trên SVG layer.
// - Zoom 50%-200%, search highlight, mini-map optional.

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, Crown, Star, Briefcase, Layers, Users, Building2,
  User, Megaphone, Search, ZoomIn, ZoomOut, Maximize2, RefreshCw, Wrench,
  GraduationCap, Sparkles, type LucideIcon,
} from 'lucide-react';
import type { Role, Profile } from '@/lib/types';

const HIDDEN_ROLE_CODES = new Set<string>([]);

// Role thuộc quyền quản lý của QLCS (per cơ sở) — clone dưới TỪNG QLCS.
// Không attach vào GD_KD theo block fallback.
const CROSS_BRANCH_OPS = new Set(['TT_LT', 'TT_AS', 'NV_SALE', 'NV_LT', 'NV_CH', 'NV_TV']);
const QLCS_TO_BRANCH: Record<string, string> = {
  QLCS_HM: 'HM', QLCS_TK: 'TK', QLCS_CTT: 'CTT', QLCS_24NCT: '24', QLCS_TT: 'TT',
};

const CARD_W = 200;
const CARD_H = 88;
const H_GAP = 28;
const V_GAP = 80;
const ROW = CARD_H + V_GAP;
const PAD = 32;

interface TreeNode {
  role: Role;
  children: TreeNode[];
  /** Unique key cho clone (vd. 'TT_LT@QLCS_HM'). Nếu không set → dùng role.code. */
  virtualKey?: string;
  /** Branch id của clone (vd. 'HM') — để filter count theo branch. */
  virtualBranch?: string;
}

function nodeKey(n: TreeNode): string {
  return n.virtualKey ?? n.role.code;
}

interface Props {
  roles: Role[];
  profiles: Profile[];
  /** branch = virtualBranch của clone (nếu có) — modal filter theo branch */
  onSelectRole: (role: Role, branch?: string | null) => void;
}

function buildTree(roles: Role[]): TreeNode | null {
  // Skip cross-branch ops từ auto-parenting (sẽ clone dưới mỗi QLCS).
  const visible = roles.filter((r) => !HIDDEN_ROLE_CODES.has(r.code) && !CROSS_BRANCH_OPS.has(r.code));
  const map = new Map<string, TreeNode>();
  visible.forEach((r) => map.set(r.code, { role: r, children: [] }));
  let root: TreeNode | null = null;

  function findParent(r: Role): string | null {
    if (r.parent_role && map.has(r.parent_role)) return r.parent_role;
    if (r.tier === 1) return null;
    if (r.dept_id) {
      for (let t = r.tier - 1; t >= 1; t--) {
        const c = visible.find((x) => x.tier === t && x.dept_id === r.dept_id);
        if (c) return c.code;
      }
    }
    if (r.block_id === 'KD') return 'GD_KD';
    if (r.block_id === 'VP') return 'GD_VP';
    if (r.tier > 1) return 'CEO';
    return null;
  }

  visible.forEach((r) => {
    const node = map.get(r.code)!;
    const parentCode = findParent(r);
    if (parentCode && map.has(parentCode) && parentCode !== r.code) {
      map.get(parentCode)!.children.push(node);
    } else if (r.tier === 1) {
      root = node;
    }
  });

  // ─── Clone CROSS_BRANCH_OPS dưới TỪNG QLCS ───
  // Spec (2026-05-28): TT_LT, TT_AS thuộc QLCS · NV_SALE QLCS trực tiếp quản lý ·
  // Tổ An sinh KHÔNG có NV An sinh — chỉ NV_CH (cứu hộ) + NV_TV (tạp vụ) dưới TT_AS ·
  // NV_LT dưới TT_LT.
  function findRole(code: string): Role | undefined {
    return roles.find((x) => x.code === code);
  }
  function vNode(r: Role, branch: string, children: TreeNode[] = []): TreeNode {
    return { role: r, children, virtualKey: `${r.code}@${branch}`, virtualBranch: branch };
  }
  function attachCrossBranch(n: TreeNode) {
    const branchId = QLCS_TO_BRANCH[n.role.code];
    if (branchId) {
      const rSale = findRole('NV_SALE');
      const rTtLt = findRole('TT_LT');
      const rTtAs = findRole('TT_AS');
      const rNvLt = findRole('NV_LT');
      const rNvCh = findRole('NV_CH');
      const rNvTv = findRole('NV_TV');

      if (rSale) n.children.push(vNode(rSale, branchId));
      if (rTtLt) {
        const ltKids: TreeNode[] = [];
        if (rNvLt) ltKids.push(vNode(rNvLt, branchId));
        n.children.push(vNode(rTtLt, branchId, ltKids));
      }
      if (rTtAs) {
        const asKids: TreeNode[] = [];
        if (rNvCh) asKids.push(vNode(rNvCh, branchId));
        if (rNvTv) asKids.push(vNode(rNvTv, branchId));
        n.children.push(vNode(rTtAs, branchId, asKids));
      }
    }
    n.children.forEach(attachCrossBranch);
  }
  if (root) attachCrossBranch(root);

  // Sort children: tier asc, dept_id, code (clones giữ thứ tự insert)
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

// ─── Color + Icon palette by role ───
interface PaletteEntry {
  bg: string;
  ring: string;
  text: string;
  accent: string;
  shadow: string;
  icon: LucideIcon;
}

function paletteFor(role: Role): PaletteEntry {
  if (role.tier === 1) {
    return {
      bg: 'bg-gradient-to-br from-rose-500 via-rose-600 to-pink-700',
      ring: 'ring-rose-300',
      text: 'text-white',
      accent: 'text-rose-100',
      shadow: 'shadow-[0_4px_6px_-1px_rgba(244,63,94,0.3),0_10px_30px_-8px_rgba(244,63,94,0.45)]',
      icon: Crown,
    };
  }
  if (role.tier === 2) {
    const isKD = role.block_id === 'KD';
    return {
      bg: isKD
        ? 'bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-700'
        : 'bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700',
      ring: isKD ? 'ring-indigo-300' : 'ring-emerald-300',
      text: 'text-white',
      accent: isKD ? 'text-indigo-100' : 'text-emerald-100',
      shadow: isKD
        ? 'shadow-[0_4px_6px_-1px_rgba(79,70,229,0.3),0_10px_30px_-8px_rgba(79,70,229,0.45)]'
        : 'shadow-[0_4px_6px_-1px_rgba(16,185,129,0.3),0_10px_30px_-8px_rgba(16,185,129,0.45)]',
      icon: Star,
    };
  }
  // Tier 3+: per-department coloring
  const dept = role.dept_id ?? '';
  if (role.is_qlcs) {
    return {
      bg: 'bg-gradient-to-br from-white to-indigo-50',
      ring: 'ring-indigo-300',
      text: 'text-indigo-900',
      accent: 'text-indigo-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(79,70,229,0.25)]',
      icon: Building2,
    };
  }
  const palettes: Record<string, PaletteEntry> = {
    KT: {
      bg: 'bg-gradient-to-br from-white to-cyan-50',
      ring: 'ring-cyan-300',
      text: 'text-cyan-900',
      accent: 'text-cyan-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(6,182,212,0.25)]',
      icon: Wrench,
    },
    DT: {
      bg: 'bg-gradient-to-br from-white to-amber-50',
      ring: 'ring-amber-300',
      text: 'text-amber-900',
      accent: 'text-amber-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(245,158,11,0.25)]',
      icon: GraduationCap,
    },
    MKT: {
      bg: 'bg-gradient-to-br from-white to-pink-50',
      ring: 'ring-pink-300',
      text: 'text-pink-900',
      accent: 'text-pink-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(236,72,153,0.25)]',
      icon: Sparkles,
    },
    TTNB: {
      bg: 'bg-gradient-to-br from-white to-purple-50',
      ring: 'ring-purple-300',
      text: 'text-purple-900',
      accent: 'text-purple-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(168,85,247,0.25)]',
      icon: Megaphone,
    },
    GS: {
      bg: 'bg-gradient-to-br from-white to-emerald-50',
      ring: 'ring-emerald-300',
      text: 'text-emerald-900',
      accent: 'text-emerald-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(16,185,129,0.25)]',
      icon: Briefcase,
    },
    KE: {
      bg: 'bg-gradient-to-br from-white to-teal-50',
      ring: 'ring-teal-300',
      text: 'text-teal-900',
      accent: 'text-teal-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(20,184,166,0.25)]',
      icon: Briefcase,
    },
    NS: {
      bg: 'bg-gradient-to-br from-white to-green-50',
      ring: 'ring-green-300',
      text: 'text-green-900',
      accent: 'text-green-600',
      shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-8px_rgba(34,197,94,0.25)]',
      icon: Users,
    },
  };
  const p = palettes[dept];
  if (p) {
    // Use role-tier-specific icon
    if (role.is_tp) p.icon = Briefcase;
    else if (role.tier === 4) p.icon = Layers;
    else if (role.tier === 5) p.icon = Users;
    else if (role.tier === 6) p.icon = User;
    return p;
  }
  // Default (no dept)
  return {
    bg: 'bg-gradient-to-br from-white to-slate-50',
    ring: 'ring-slate-300',
    text: 'text-slate-800',
    accent: 'text-slate-500',
    shadow: 'shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_16px_-8px_rgba(15,23,42,0.2)]',
    icon: role.tier <= 5 ? Users : User,
  };
}

// Layout: tính x,y cho từng node trong subtree
interface PlacedNode {
  node: TreeNode;
  x: number; // center x
  y: number; // top y
}

function measureWidth(node: TreeNode, expanded: Set<string>): number {
  if (!expanded.has(nodeKey(node)) || node.children.length === 0) {
    return CARD_W + H_GAP;
  }
  return node.children.reduce((s, c) => s + measureWidth(c, expanded), 0);
}

function layoutTree(node: TreeNode, x: number, y: number, expanded: Set<string>, out: PlacedNode[]): number {
  const myWidth = measureWidth(node, expanded);
  const centerX = x + myWidth / 2;
  out.push({ node, x: centerX, y });

  if (expanded.has(nodeKey(node)) && node.children.length > 0) {
    let childX = x;
    for (const child of node.children) {
      const cw = measureWidth(child, expanded);
      layoutTree(child, childX, y + ROW, expanded, out);
      childX += cw;
    }
  }
  return myWidth;
}

export function OrgTreeView({ roles, profiles, onSelectRole }: Props) {
  const tree = useMemo(() => buildTree(roles), [roles]);

  // count theo role; cũng tính theo branch cho clone nodes
  const countByRole = useMemo(() => {
    const m: Record<string, number> = {};
    profiles.forEach((p) => { m[p.role_code] = (m[p.role_code] || 0) + 1; });
    return m;
  }, [profiles]);
  const countByRoleBranch = useMemo(() => {
    const m: Record<string, number> = {};
    profiles.forEach((p) => {
      if (!p.facility_id) return;
      const k = `${p.role_code}__${p.facility_id}`;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [profiles]);
  function countForNode(n: TreeNode): number {
    if (n.virtualBranch) {
      return countByRoleBranch[`${n.role.code}__${n.virtualBranch}`] ?? 0;
    }
    return countByRole[n.role.code] ?? 0;
  }

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    roles.forEach((r) => { if (r.tier <= 3) s.add(r.code); });
    return s;
  });
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const placed = useMemo(() => {
    if (!tree) return [] as PlacedNode[];
    const out: PlacedNode[] = [];
    layoutTree(tree, PAD, PAD, expanded, out);
    return out;
  }, [tree, expanded]);

  const { width, height } = useMemo(() => {
    if (placed.length === 0) return { width: 0, height: 0 };
    let maxX = 0, maxY = 0;
    for (const p of placed) {
      maxX = Math.max(maxX, p.x + CARD_W / 2);
      maxY = Math.max(maxY, p.y + CARD_H);
    }
    return { width: maxX + PAD, height: maxY + PAD };
  }, [placed]);

  // Map for quick lookup (by nodeKey để hỗ trợ clones)
  const placedMap = useMemo(() => {
    const m = new Map<string, PlacedNode>();
    placed.forEach((p) => m.set(nodeKey(p.node), p));
    return m;
  }, [placed]);

  // Compute edges
  const edges = useMemo(() => {
    const out: { from: PlacedNode; to: PlacedNode }[] = [];
    for (const p of placed) {
      if (!expanded.has(nodeKey(p.node))) continue;
      for (const child of p.node.children) {
        const c = placedMap.get(nodeKey(child));
        if (c) out.push({ from: p, to: c });
      }
    }
    return out;
  }, [placed, placedMap, expanded]);

  // Highlight matches
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    const s = new Set<string>();
    for (const r of roles) {
      if (
        r.code.toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.dept_id ?? '').toLowerCase().includes(q)
      ) s.add(r.code);
    }
    return s;
  }, [query, roles]);

  // Auto-expand to show matches
  useEffect(() => {
    if (matches.size === 0) return;
    const parents = new Set<string>();
    function findPath(node: TreeNode | null, codeToFind: string, path: string[]): boolean {
      if (!node) return false;
      if (node.role.code === codeToFind) return true;
      path.push(nodeKey(node));
      for (const child of node.children) {
        if (findPath(child, codeToFind, path)) return true;
      }
      path.pop();
      return false;
    }
    for (const code of matches) {
      const path: string[] = [];
      if (tree && findPath(tree, code, path)) {
        path.forEach((p) => parents.add(p));
      }
    }
    setExpanded((cur) => {
      const n = new Set(cur);
      parents.forEach((p) => n.add(p));
      return n;
    });
  }, [matches, tree]);

  function toggle(key: string) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }
  function expandAll() {
    if (!tree) return;
    const all = new Set<string>();
    function visit(n: TreeNode) {
      all.add(nodeKey(n));
      n.children.forEach(visit);
    }
    visit(tree);
    setExpanded(all);
  }
  function collapseAll() {
    setExpanded(new Set(roles.filter((r) => r.tier === 1).map((r) => r.code)));
  }
  function resetView() {
    setZoom(1);
    setQuery('');
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  }

  if (!tree) {
    return (
      <div className="card text-center py-12 text-slate-500">
        Không tìm thấy gốc cây (CEO). Kiểm tra dữ liệu roles.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="card !p-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm vai trò / phòng / mã…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
          {matches.size > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {matches.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1 py-0.5 bg-white">
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Thu nhỏ">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono text-slate-700 px-1 min-w-[36px] text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Phóng to">
            <ZoomIn size={14} />
          </button>
        </div>
        <button onClick={expandAll} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5">
          <ChevronDown size={12} /> Mở
        </button>
        <button onClick={collapseAll} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5">
          <ChevronRight size={12} /> Thu
        </button>
        <button onClick={resetView} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5">
          <RefreshCw size={12} /> Reset
        </button>
        <button onClick={() => containerRef.current?.requestFullscreen?.()} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5">
          <Maximize2 size={12} /> Full
        </button>
      </div>

      {/* Tree canvas */}
      <div
        ref={containerRef}
        className="relative rounded-2xl border border-slate-200 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50"
        style={{ maxHeight: '78vh' }}
      >
        {/* Grid background pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
          aria-hidden
        />

        <div
          className="relative origin-top-left transition-transform duration-200"
          style={{ width, height, transform: `scale(${zoom})` }}
        >
          {/* SVG layer for connections */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={width}
            height={height}
            style={{ overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="edgeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#cbd5e1" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.4" />
              </linearGradient>
              <filter id="edgeShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
              </filter>
            </defs>
            {edges.map(({ from, to }, i) => {
              const x1 = from.x;
              const y1 = from.y + CARD_H;
              const x2 = to.x;
              const y2 = to.y;
              const midY = (y1 + y2) / 2;
              // Smooth cubic bezier (vertical control points)
              const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              const isMatched = matches.has(from.node.role.code) || matches.has(to.node.role.code);
              return (
                <g key={i}>
                  <path
                    d={path}
                    stroke={isMatched ? '#10b981' : 'url(#edgeGradient)'}
                    strokeWidth={isMatched ? 2.5 : 1.6}
                    fill="none"
                    filter="url(#edgeShadow)"
                    opacity={isMatched ? 0.9 : 0.75}
                  />
                </g>
              );
            })}
          </svg>

          {/* Node layer */}
          {placed.map(({ node, x, y }) => {
            const k = nodeKey(node);
            return (
              <NodeCard
                key={k}
                node={node}
                x={x - CARD_W / 2}
                y={y}
                count={countForNode(node)}
                expanded={expanded.has(k)}
                hasChildren={node.children.length > 0}
                matched={matches.size > 0 && matches.has(node.role.code)}
                dimmed={matches.size > 0 && !matches.has(node.role.code)}
                onToggle={() => toggle(k)}
                onSelect={() => onSelectRole(node.role, node.virtualBranch)}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="card !p-3">
        <div className="text-xs font-semibold text-slate-700 mb-2">Chú thích màu sắc</div>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <LegendDot grad="from-rose-500 to-pink-700" label="Lãnh đạo (T1)" />
          <LegendDot grad="from-blue-500 to-violet-700" label="GĐ Khối KD" />
          <LegendDot grad="from-emerald-500 to-cyan-700" label="GĐ Khối VP" />
          <LegendDot grad="from-cyan-200 to-cyan-100" label="Kỹ thuật" outline="ring-cyan-300" />
          <LegendDot grad="from-amber-200 to-amber-100" label="Đào tạo" outline="ring-amber-300" />
          <LegendDot grad="from-pink-200 to-pink-100" label="Marketing" outline="ring-pink-300" />
          <LegendDot grad="from-purple-200 to-purple-100" label="TT Nội bộ" outline="ring-purple-300" />
          <LegendDot grad="from-indigo-200 to-indigo-100" label="QLCS" outline="ring-indigo-300" />
          <LegendDot grad="from-emerald-200 to-emerald-100" label="Giám sát/Kế toán/NS" outline="ring-emerald-300" />
        </div>
      </div>
    </div>
  );
}

function LegendDot({ grad, label, outline }: { grad: string; label: string; outline?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-4 h-4 rounded bg-gradient-to-br ${grad} ${outline ? `ring-1 ${outline}` : ''}`} />
      <span className="text-slate-700">{label}</span>
    </span>
  );
}

// ─── NodeCard ───
interface NodeCardProps {
  node: TreeNode;
  x: number;
  y: number;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  matched: boolean;
  dimmed: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function NodeCard({ node, x, y, count, expanded, hasChildren, matched, dimmed, onToggle, onSelect }: NodeCardProps) {
  const p = paletteFor(node.role);
  const Icon = p.icon;

  return (
    <div
      className="absolute transition-all duration-300"
      style={{
        left: x,
        top: y,
        width: CARD_W,
        height: CARD_H,
        opacity: dimmed ? 0.35 : 1,
        zIndex: matched ? 20 : 10,
      }}
    >
      <button
        onClick={onSelect}
        className={`group relative w-full h-full rounded-xl ${p.bg} ring-1 ${p.ring} ${p.shadow} ${matched ? 'ring-2 ring-emerald-500 scale-[1.04]' : ''}
          hover:scale-[1.03] hover:shadow-[0_10px_25px_-10px_rgba(0,0,0,0.3),0_20px_40px_-15px_rgba(0,0,0,0.15)]
          transition-all duration-200 text-left px-3 py-2.5 cursor-pointer
          before:absolute before:inset-0 before:rounded-xl before:pointer-events-none
          before:bg-gradient-to-b before:from-white/20 before:to-transparent before:opacity-60
          after:absolute after:inset-x-3 after:-bottom-1 after:h-2 after:rounded-full after:bg-black/10 after:blur-md after:opacity-50`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Icon badge */}
        <div className="flex items-start gap-2 relative">
          <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg
            ${node.role.tier <= 2 ? 'bg-white/20 ring-1 ring-white/30' : 'bg-white ring-1 ring-slate-200'}
            ${p.accent}`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-bold text-[13px] leading-tight ${p.text} line-clamp-2`}>
              {node.role.name}
            </div>
            <div className={`text-[10px] font-mono mt-0.5 ${p.accent} flex items-center gap-1.5`}>
              <span>{node.role.code}</span>
              <span className="opacity-60">·</span>
              <span>T{node.role.tier}</span>
            </div>
          </div>
        </div>

        {/* Bottom row: count + tier badge + virtual branch badge */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
          {count > 0 ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
              ${node.role.tier <= 2 ? 'bg-white/25 text-white ring-1 ring-white/30' : 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm'}`}>
              <Users size={10} /> {count}
            </span>
          ) : (
            <span className={`text-[10px] italic opacity-60 ${node.role.tier <= 2 ? 'text-white/70' : 'text-slate-400'}`}>
              chưa có nhân sự
            </span>
          )}
          {node.virtualBranch ? (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
              @{node.virtualBranch}
            </span>
          ) : node.role.dept_id ? (
            <span className={`text-[9px] font-bold uppercase tracking-wider
              ${node.role.tier <= 2 ? 'text-white/70' : 'text-slate-400'}`}>
              {node.role.dept_id}
            </span>
          ) : null}
        </div>
      </button>

      {/* Expand toggle */}
      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="absolute left-1/2 -translate-x-1/2 -bottom-3 z-30 w-6 h-6 rounded-full bg-white ring-2 ring-slate-300 hover:ring-emerald-400 hover:scale-110 transition flex items-center justify-center shadow-md"
          title={expanded ? 'Thu gọn' : 'Mở rộng'}
        >
          {expanded ? <ChevronDown size={12} className="text-slate-700" /> : <ChevronRight size={12} className="text-slate-700" />}
        </button>
      )}
    </div>
  );
}
