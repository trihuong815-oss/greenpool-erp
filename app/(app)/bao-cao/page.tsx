import { ModuleShell } from '@/components/ModuleShell';

export default function BaoCaoPage() {
  return <ModuleShell
    route="bao-cao"
    title="Báo cáo tự động"
    subtitle="Xuất file Word/Excel theo lịch hoặc theo yêu cầu"
    description="Hệ thống tự động xuất báo cáo định kỳ + on-demand."
    emoji="📊"
    features={[
      'Báo cáo doanh thu tuần/tháng/quý',
      'Báo cáo KPI nhân sự',
      'Báo cáo lương 3P',
      'Báo cáo checklist tuân thủ',
      'Custom template + ký số + gửi email',
    ]}
  />;
}
