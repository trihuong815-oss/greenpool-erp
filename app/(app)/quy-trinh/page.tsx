import { ModuleShell } from '@/components/ModuleShell';

export default function QuyTrinhPage() {
  return <ModuleShell
    route="quy-trinh"
    title="Quy trình vận hành phòng ban"
    subtitle="Tài liệu vận hành chính thức · Upload file · Quản lý phiên bản"
    description="Mỗi phòng có quy trình riêng. Upload file PDF/Word/Excel, lưu version lịch sử."
    emoji="📋"
    features={[
      'Tổ chức theo Khối → Phòng → Quy trình',
      'Upload file PDF/Word/Excel/Ảnh',
      'Lưu version lịch sử cho mỗi lần cập nhật',
      'TP quản lý quy trình phòng mình',
      'NV và QLCS xem (tải xuống file)',
    ]}
  />;
}
