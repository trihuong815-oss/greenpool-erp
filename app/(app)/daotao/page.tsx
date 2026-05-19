import { ModuleShell } from '@/components/ModuleShell';

export default function DaoTaoPage() {
  return <ModuleShell
    route="daotao"
    title="Quản lý Đào tạo (Tích hợp API)"
    subtitle="Đồng bộ với App giáo viên hiện có"
    description="Đọc dữ liệu học viên, giáo viên, lớp học từ App Đào tạo."
    emoji="🎓"
    features={[
      'Học viên đang học × dịch vụ × cơ sở',
      'Học viên tốt nghiệp YTD (HBCB, CLC, Lặn)',
      'Tỷ lệ tốt nghiệp + Funnel chuyển đổi',
      'Tích hợp API qua REST/GraphQL',
    ]}
  />;
}
