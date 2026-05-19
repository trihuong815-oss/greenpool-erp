import { ModuleShell } from '@/components/ModuleShell';

export default function SoDoPage() {
  return <ModuleShell
    route="sodo"
    title="Sơ đồ tổ chức"
    subtitle="42 vai trò × 5 tầng"
    description="Sơ đồ tổ chức tương tác, click vào vai trò để xem chi tiết nhân sự."
    emoji="👥"
    features={[
      'Tầng 1: CEO/CĐT',
      'Tầng 2: 2 GĐ Khối (KD + VP)',
      'Tầng 3: 12 vai trò (QLCS, TP, Tiểu ban)',
      'Tầng 4: 11 vai trò (Phó phòng, Tổ trưởng)',
      'Tầng 5: 16 vai trò Nhân viên',
    ]}
  />;
}
