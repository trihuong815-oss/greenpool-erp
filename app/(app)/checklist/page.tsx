import { ModuleShell } from '@/components/ModuleShell';

export default function ChecklistPage() {
  return <ModuleShell
    route="checklist"
    title="Checklist vận hành"
    subtitle="Theo dõi công việc hàng ngày theo vai trò"
    description="Mẫu checklist theo phòng/vai trò, có lịch sử tuân thủ và audit."
    emoji="✅"
    features={[
      'Mẫu checklist riêng cho từng vai trò (Cứu hộ, Lễ tân, Kỹ thuật, Giáo viên...)',
      'GĐ Khối tùy chỉnh checklist của khối mình',
      'Theo dõi tỷ lệ tuân thủ theo cơ sở',
      'TP Giám sát audit định kỳ',
    ]}
  />;
}
