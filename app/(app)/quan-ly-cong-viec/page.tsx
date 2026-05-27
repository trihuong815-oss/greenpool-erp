import { ModuleShell } from '@/components/ModuleShell';

export default function QuanLyCongViecPage() {
  return <ModuleShell
    route="quan-ly-cong-viec"
    title="Quản lý công việc"
    subtitle="Lên lịch & theo dõi công việc theo phòng ban / cơ sở / khối"
    description="Module quản lý công việc nội bộ — mỗi tài khoản quản lý lên lịch + theo dõi công việc trong phạm vi quyền của mình."
    emoji="📅"
    features={[
      'CEO/GĐ: theo dõi toàn hệ thống',
      'QLCS: lịch + công việc của cơ sở mình',
      'Trưởng phòng: công việc phòng ban',
      'Tổ trưởng: công việc của tổ',
      'Lịch tuần / tháng / quý',
      'Trạng thái: chờ · đang làm · xong · trễ',
      'Audit log mọi thao tác',
    ]}
  />;
}
