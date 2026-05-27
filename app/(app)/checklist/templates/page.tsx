import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canAccessRoute } from '@/lib/permissions';
import { requireAuthedProfile } from '@/lib/firebase/current-profile';
import { AppTopBar } from '@/components/AppTopBar';
import { canManageTemplates } from '../helpers';
import { TemplateConfig } from '../TemplateConfig';
import { getChecklistReferenceDataFirebase } from '../data.refs.firebase';

export default async function ChecklistTemplatesPage() {
  const { profile } = await requireAuthedProfile();

  const blocked =
    !canAccessRoute(profile.roleCode, 'checklist', profile.menuOverrides) ||
    !canManageTemplates(profile.roleCode);

  if (blocked) {
    return (
      <>
        <AppTopBar title="Cấu hình mẫu checklist" icon="fileText" />
        <div className="flex-1 flex items-center justify-center p-3 md:p-6 bg-slate-50">
          <div className="card text-center py-12 max-w-md">
            <div className="text-5xl mb-4">🔒</div>
            <div className="font-bold text-slate-800 text-lg mb-2">Không có quyền cấu hình mẫu</div>
            <div className="text-sm text-slate-500">
              Chỉ Admin, GĐ Khối, QLCS, Trưởng/phó phòng được phép truy cập trang này.
            </div>
          </div>
        </div>
      </>
    );
  }

  const refs = await getChecklistReferenceDataFirebase(profile.roleCode);

  return (
    <>
      <AppTopBar
        title="Cấu hình mẫu checklist"
        subtitle="Tạo / sửa / lưu trữ template theo cơ sở · bộ phận · ca"
        icon="fileText"
      />
      <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-slate-50">
        <div className="mb-3">
          <Link href="/checklist"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft size={14} /> Quay lại Checklist vận hành
          </Link>
        </div>
        <TemplateConfig
          userRole={profile.roleCode}
          roles={refs.roles}
          departments={refs.departments}
        />
      </div>
    </>
  );
}
