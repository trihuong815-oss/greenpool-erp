import { ModuleShell } from '@/components/ModuleShell';

export default function GiaoViecPage() {
  return <ModuleShell
    route="giao-viec"
    title="Đề xuất · Nhiệm vụ · Giao việc"
    subtitle="Workflow 3 chiều: gửi ↑↔, nhận ↓, giao ↓"
    description="Quản lý đề xuất + nhiệm vụ + giao việc theo từng vai trò."
    emoji="📋"
    features={[
      '3 tab: Đề xuất / Nhiệm vụ / Giao việc',
      'Trong khối: đề xuất đi thẳng người nhận',
      'Chéo khối: cần 2 GĐ phê duyệt',
      'Thông báo real-time khi có việc mới',
      'Kanban 3 cột: Chờ / Đang xử lý / Hoàn thành',
    ]}
  />;
}
