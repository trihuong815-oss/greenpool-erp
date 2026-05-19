import { ModuleShell } from '@/components/ModuleShell';

export default function MKTPage() {
  return <ModuleShell
    route="mkt"
    title="Quản lý Marketing (Tích hợp API)"
    subtitle="Đồng bộ với App MKT + CRM"
    description="Đọc dữ liệu leads, chiến dịch, CPL từ App MKT."
    emoji="📣"
    features={[
      'Tổng leads theo nguồn (Renew/Refer/Face/...)',
      'Tỷ lệ chốt theo nguồn × cơ sở',
      'Chi phí Ads + CPL trung bình',
      'QLCS thấy data riêng của CS mình',
    ]}
  />;
}
