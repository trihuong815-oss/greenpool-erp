import { ModuleShell } from '@/components/ModuleShell';

export default function SettingsPackagesPage() {
  return <ModuleShell
    route="settings-packages"
    title="Quản lý gói dịch vụ"
    subtitle="40 gói × 8 nhóm — CEO/GĐ KD/QLCS quản lý"
    description="CRUD gói dịch vụ, set doanh thu × 5 cơ sở."
    emoji="⚙️"
    features={[
      '8 nhóm dịch vụ × ~40 gói',
      'CEO/GĐ KD sửa tất cả',
      'QLCS chỉ sửa cột cơ sở mình',
      'Gói độc quyền (PT/Fitness chỉ 24 NCT)',
      'Audit log mọi thay đổi',
    ]}
  />;
}
