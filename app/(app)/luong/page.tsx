import { ModuleShell } from '@/components/ModuleShell';

export default function LuongPage() {
  return <ModuleShell
    route="luong"
    title="Lương 3P & KPI 3 tầng"
    subtitle="Mô hình lương thưởng theo vị trí + năng lực + KPI"
    description="P1 lương vị trí + P2 lương năng lực + P3 KPI biến đổi."
    emoji="💰"
    features={[
      'Công thức 3P tự động tính lương cuối tháng',
      'KPI 3 tầng: Outcome / Process / Input',
      'Đánh giá ma trận cho vai trò chuyên môn (QLCS + TP)',
      'Audit log cho mỗi lần điều chỉnh KPI',
    ]}
  />;
}
