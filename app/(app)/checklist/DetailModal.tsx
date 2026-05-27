'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, Circle, Send, AlertTriangle, X, Paperclip, FileImage,
} from 'lucide-react';
import { checklistApi } from '@/lib/services/checklist/api-client';
import {
  STATUS_LABEL,
  formatVNDate,
  getChecklistDisplayName, getShiftDisplay, getGroupDisplay,
  type ChecklistInstance, type ChecklistInstanceItem, type ChecklistTemplate,
  type Facility, type Department,
} from './helpers';

interface Props {
  instance: ChecklistInstance;
  template: ChecklistTemplate;
  items: ChecklistInstanceItem[];
  userId: string;
  userName: string;
  userRoleName: string;
  facility?: Facility;
  department?: Department;
  canSubmit: boolean;
  canApprove: boolean;
  onClose: () => void;
  onUpdate: (next: { instance: ChecklistInstance; items: ChecklistInstanceItem[] }) => void;
}

type AuditAction =
  | 'submit' | 'approve' | 'reject'
  | 'upload_file' | 'remove_file'
  | 'check_item' | 'uncheck_item';

const ALLOWED_MIME = ['image/jpeg','image/png','image/webp','application/pdf'] as const;
const MAX_SIZE_IMAGE = 5 * 1024 * 1024;   // 5MB
const MAX_SIZE_PDF   = 10 * 1024 * 1024;  // 10MB

function validateUploadFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
    return 'Loại file không hợp lệ. Chỉ chấp nhận: ảnh JPG/PNG/WEBP hoặc PDF.';
  }
  const isPdf = file.type === 'application/pdf';
  const max = isPdf ? MAX_SIZE_PDF : MAX_SIZE_IMAGE;
  if (file.size > max) {
    return `File quá lớn. Giới hạn ${(max / 1024 / 1024)|0}MB cho ${isPdf ? 'PDF' : 'ảnh'}.`;
  }
  return null;
}

export function DetailModal(props: Props) {
  const { instance, template, items: initialItems,
    userId, userName, userRoleName,
    facility, department,
    canSubmit, canApprove, onClose, onUpdate } = props;

  // Ghi audit log qua API route. Không block UI nếu lỗi — log warning để debug.
  async function logAudit(action: AuditAction, instanceId: string, details?: Record<string, unknown>) {
    try {
      await checklistApi.logAudit(instanceId, action, details);
    } catch (e: any) {
      console.warn(`[audit] insert ${action} failed:`, e?.message ?? e);
    }
  }

  const [items, setItems] = useState<ChecklistInstanceItem[]>(initialItems);
  const [inst, setInst] = useState<ChecklistInstance>(instance);
  const [generalNote, setGeneralNote] = useState(instance.general_note || '');
  const [incident, setIncident] = useState(instance.incident_report || '');
  const [operatorName, setOperatorName] = useState(instance.actual_operator_name || '');
  const [operatorRole, setOperatorRole] = useState(instance.actual_operator_role || '');
  const [reviewNote, setReviewNote] = useState(instance.review_note || '');
  const [error, setError] = useState<string | null>(null);

  const isLocked = ['submitted', 'approved', 'failed'].includes(inst.status);
  const totalItems = items.length;
  const checkedCount = items.filter(i => i.is_checked).length;
  const s = STATUS_LABEL[inst.status];

  function pushUpdate(nextInst: ChecklistInstance, nextItems: ChecklistInstanceItem[]) {
    setInst(nextInst);
    setItems(nextItems);
    onUpdate({ instance: nextInst, items: nextItems });
  }

  async function toggleCheck(item: ChecklistInstanceItem) {
    if (isLocked || !canSubmit) return;
    const wants = !item.is_checked;
    try {
      const { status: nextStatus } = await checklistApi.toggleItem(inst.id, item.id, wants, item.content);
      const patch = {
        is_checked: wants,
        checked_at: wants ? new Date().toISOString() : null,
        checked_by: wants ? userId : null,
      };
      const nextItems = items.map(it => it.id === item.id ? { ...it, ...patch } : it);
      const nextInst = nextStatus !== inst.status ? { ...inst, status: nextStatus as ChecklistInstance['status'] } : inst;
      pushUpdate(nextInst, nextItems);
    } catch (e: any) {
      setError(e?.message ?? 'Toggle thất bại');
    }
  }

  async function updateItemNote(item: ChecklistInstanceItem, note: string) {
    try {
      await checklistApi.patchItem(inst.id, item.id, { note: note || null });
      pushUpdate(inst, items.map(it => it.id === item.id ? { ...it, note: note || null } : it));
    } catch (e: any) {
      setError(e?.message ?? 'Cập nhật ghi chú thất bại');
    }
  }

  async function uploadFile(item: ChecklistInstanceItem, file: File) {
    // Client-side validate (server cũng validate lại — defence in depth)
    const valErr = validateUploadFile(file);
    if (valErr) { setError(valErr); return; }

    try {
      const { file_urls: newUrls } = await checklistApi.uploadFile(inst.id, item.id, file);
      // Audit log đã được API ghi (dual-write auditLogs + checklistAuditLogs)
      pushUpdate(inst, items.map(it => it.id === item.id ? { ...it, file_urls: newUrls } : it));
    } catch (e: any) {
      setError('Upload lỗi: ' + (e?.message ?? e));
    }
  }

  async function removeFile(item: ChecklistInstanceItem, urlIdx: number) {
    const path = item.file_urls[urlIdx];
    if (!path) return;
    if (!confirm('Xoá file này?')) return;
    try {
      const { file_urls: newUrls } = await checklistApi.removeFile(inst.id, item.id, path);
      pushUpdate(inst, items.map(it => it.id === item.id ? { ...it, file_urls: newUrls } : it));
    } catch (e: any) {
      setError('Xoá file lỗi: ' + (e?.message ?? e));
    }
  }

  async function submit() {
    const uncheckedRequired = items.filter(it => it.is_required && !it.is_checked);
    if (uncheckedRequired.length > 0) {
      alert(`Còn ${uncheckedRequired.length} mục bắt buộc chưa check:\n- ${uncheckedRequired.map(i => i.content).join('\n- ')}`);
      return;
    }
    const missingFiles = items.filter(it => it.requires_file && (!it.file_urls || it.file_urls.length === 0));
    if (missingFiles.length > 0) {
      alert(`Các mục yêu cầu file/ảnh nhưng chưa upload:\n- ${missingFiles.map(i => i.content).join('\n- ')}`);
      return;
    }
    const missingNotes = items.filter(it => it.requires_note && it.is_checked && (!it.note || it.note.trim() === ''));
    if (missingNotes.length > 0) {
      alert(`Các mục yêu cầu ghi chú nhưng chưa có:\n- ${missingNotes.map(i => i.content).join('\n- ')}`);
      return;
    }

    const opName = operatorName.trim();
    const opRole = operatorRole.trim();
    if (!opName) { alert('Vui lòng nhập tên người thực hiện thực tế.'); return; }
    if (!opRole) { alert('Vui lòng nhập chức vụ người thực hiện thực tế.'); return; }

    const hasReviewer = !!inst.reviewer_id;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: hasReviewer ? 'submitted' : 'approved',
      submitted_at: now,
      submitted_by: userId,
      general_note: generalNote.trim() || null,
      incident_report: incident.trim() || null,
      actual_operator_name: opName,
      actual_operator_role: opRole,
    };
    if (!hasReviewer) {
      patch.reviewed_at = now;
      patch.approved_at = now;
      patch.approved_by = userId;
    }

    try {
      const { instance: row } = await checklistApi.patchInstance(inst.id, patch);
      await logAudit('submit', inst.id, {
        operator_name: opName,
        operator_role: opRole,
        has_incident: !!incident.trim(),
        auto_approved: !hasReviewer,
      });
      pushUpdate(row as ChecklistInstance, items);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Submit thất bại');
    }
  }

  async function approve() {
    if (!canApprove) { setError('Anh không có quyền duyệt checklist này.'); return; }
    const now = new Date().toISOString();
    const patch = {
      status: 'approved' as const,
      reviewed_at: now,
      approved_at: now,
      approved_by: userId,
      review_note: reviewNote.trim() || null,
    };
    try {
      const { instance: row } = await checklistApi.patchInstance(inst.id, patch);
      await logAudit('approve', inst.id, { note: reviewNote.trim() || null });
      pushUpdate(row as ChecklistInstance, items);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Duyệt thất bại');
    }
  }

  async function reject() {
    if (!canApprove) { setError('Anh không có quyền trả về checklist này.'); return; }
    if (!reviewNote.trim()) { alert('Vui lòng nhập lý do trả về.'); return; }
    const patch = {
      status: 'rejected' as const,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote.trim(),
    };
    try {
      const { instance: row } = await checklistApi.patchInstance(inst.id, patch);
      await logAudit('reject', inst.id, { reason: reviewNote.trim() });
      pushUpdate(row as ChecklistInstance, items);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Trả về thất bại');
    }
  }

  const groupSrc = inst.checklist_group ?? template.checklist_group;
  const displayName = getChecklistDisplayName({
    checklist_group: groupSrc,
    checklist_type:  template.checklist_type,
    shift_type:      template.shift_type,
    template_name:   template.name,
    role_label:      template.role_label,
  });
  const groupDisplay = getGroupDisplay(groupSrc);
  const shiftDisplay = getShiftDisplay(template.shift_type, groupSrc);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${s.cls}`}>{s.label}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {groupDisplay}
              </span>
            </div>
            <div className="font-bold text-slate-800 text-lg">
              {displayName}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-slate-600">
              {facility && <span>📍 {facility.name}</span>}
              {department && <span>🏢 {department.name}</span>}
              <span>⏱ {shiftDisplay}</span>
              {template.scheduled_time && <span className="text-amber-700">▶ {template.scheduled_time.slice(0,5)}</span>}
              {template.deadline_time && <span className="text-rose-700">⏰ {template.deadline_time.slice(0,5)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {error && (
            <div className="card text-rose-700 bg-rose-50 border border-rose-200 text-sm">{error}</div>
          )}

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-slate-600">
                Tiến độ {checkedCount}/{totalItems}
              </div>
              <div className="text-xs text-slate-500">
                {totalItems > 0 ? Math.round(checkedCount/totalItems*100) : 0}%
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all"
                style={{ width: `${totalItems > 0 ? (checkedCount/totalItems)*100 : 0}%` }} />
            </div>
          </div>

          {/* Items */}
          {items.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded text-sm">
              <div className="font-semibold text-amber-900 mb-1">⚠️ Chưa có mục kiểm tra</div>
              <div className="text-amber-700">
                Template này chưa cấu hình items. Vào /checklist/templates để thêm.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <ItemRow key={item.id} item={item} index={idx + 1}
                  locked={isLocked || !canSubmit}
                  onToggle={() => toggleCheck(item)}
                  onUpdateNote={(note) => updateItemNote(item, note)}
                  onUpload={(file) => uploadFile(item, file)}
                  onRemoveFile={(i) => removeFile(item, i)} />
              ))}
            </div>
          )}

          {/* Operator info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded">
            <div className="text-xs font-semibold text-slate-600 mb-2">
              👤 Người thực hiện thực tế <span className="text-rose-600">*</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                disabled={isLocked || !canSubmit}
                placeholder="Họ tên"
                className="px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400 disabled:bg-white" />
              <input type="text" value={operatorRole}
                onChange={e => setOperatorRole(e.target.value)}
                disabled={isLocked || !canSubmit}
                placeholder="Chức vụ (vd: NV Lễ tân ca sáng)"
                className="px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400 disabled:bg-white" />
            </div>
            {isLocked && inst.actual_operator_name && (
              <div className="text-xs text-slate-500 mt-2">
                ✓ Đã ghi nhận: <strong>{inst.actual_operator_name}</strong>
                {inst.actual_operator_role && ` — ${inst.actual_operator_role}`}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Ghi chú chung cho cả checklist
            </label>
            <textarea value={generalNote} onChange={e => setGeneralNote(e.target.value)}
              disabled={isLocked || !canSubmit}
              rows={2} placeholder="Tóm tắt ca làm việc, lưu ý chung…"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400 disabled:bg-slate-50" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 inline-flex items-center gap-1">
              <AlertTriangle size={12} className="text-amber-600" /> Báo cáo sự cố (nếu có)
            </label>
            <textarea value={incident} onChange={e => setIncident(e.target.value)}
              disabled={isLocked || !canSubmit}
              rows={2} placeholder="Ghi sự cố trong ca — sẽ chuyển cho cấp trên cùng checklist"
              className="w-full px-3 py-2 border border-slate-200 rounded text-sm focus:outline-none focus:border-slate-400 disabled:bg-slate-50" />
          </div>

          {/* Reviewer area: chỉ hiện khi user có quyền duyệt và checklist đang chờ */}
          {canApprove && inst.status === 'submitted' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
              <div className="text-xs font-semibold text-amber-900">
                ✋ Khu vực duyệt (chỉ QLCS / người duyệt)
              </div>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                rows={2} placeholder="Ghi chú duyệt / lý do trả về"
                className="w-full px-3 py-2 border border-amber-200 bg-white rounded text-sm focus:outline-none focus:border-amber-400" />
            </div>
          )}

          {inst.review_note && inst.status === 'rejected' && (
            <div className="text-xs mt-1 p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded">
              <strong>Ghi chú trả về:</strong> {inst.review_note}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-white">
            Đóng
          </button>
          {canSubmit && !isLocked && (
            <button onClick={submit}
              className="inline-flex items-center gap-2 px-5 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700">
              <Send size={16} /> Gửi cấp trên
            </button>
          )}
          {canApprove && inst.status === 'submitted' && (
            <>
              <button onClick={reject}
                className="px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700">
                Trả về
              </button>
              <button onClick={approve}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700">
                Duyệt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, index, locked, onToggle, onUpdateNote, onUpload, onRemoveFile }: {
  item: ChecklistInstanceItem;
  index: number;
  locked: boolean;
  onToggle: () => void;
  onUpdateNote: (note: string) => void;
  onUpload: (file: File) => void;
  onRemoveFile: (idx: number) => void;
}) {
  const [showNote, setShowNote] = useState(!!item.note);
  const [noteDraft, setNoteDraft] = useState(item.note || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const needsFile = item.requires_file;
  const hasFile = (item.file_urls?.length || 0) > 0;

  function saveNote() {
    if (noteDraft !== (item.note || '')) onUpdateNote(noteDraft);
  }

  return (
    <div className={`rounded-lg border ${item.is_checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'} p-3`}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} disabled={locked}
          className="flex-shrink-0 disabled:cursor-default"
          aria-label={item.is_checked ? 'Bỏ check' : 'Check'}>
          {item.is_checked
            ? <CheckCircle2 size={28} className="text-emerald-600" />
            : <Circle size={28} className="text-slate-300" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-slate-400">#{index}</span>
            {item.is_required && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Bắt buộc</span>
            )}
            {needsFile && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasFile ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                <Paperclip size={10} className="inline" /> {hasFile ? 'Đã có file' : 'Cần file'}
              </span>
            )}
            {item.requires_note && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">Cần ghi chú</span>
            )}
          </div>
          <div className={`text-sm leading-relaxed ${item.is_checked ? 'text-slate-600' : 'text-slate-800 font-medium'}`}>
            {item.content}
          </div>
          {item.is_checked && item.checked_at && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              ✓ {formatVNDate(item.checked_at)}
            </div>
          )}

          {(needsFile || hasFile) && (
            <div className="mt-2 space-y-1">
              {item.file_urls?.map((url, i) => (
                <FileChip key={i} path={url} onRemove={locked ? undefined : () => onRemoveFile(i)} />
              ))}
              {!locked && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-dashed border-amber-300 text-amber-800 hover:bg-amber-50">
                    <Paperclip size={12} /> Tải file/ảnh
                  </button>
                </>
              )}
            </div>
          )}

          {showNote || item.note ? (
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
              onBlur={saveNote} disabled={locked}
              rows={1} placeholder="Ghi chú cho mục này…"
              className="mt-2 w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-slate-400 disabled:bg-slate-50" />
          ) : !locked && (
            <button onClick={() => setShowNote(true)}
              className="mt-1 text-xs text-slate-400 hover:text-slate-700">
              + Thêm ghi chú
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FileChip({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const fileName = path.split('/').pop() || 'file';
  const isImage = /\.(jpe?g|png|webp|heic|gif)$/i.test(fileName);

  useEffect(() => {
    let cancelled = false;
    checklistApi.getSignedUrl(path)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch((e) => { if (!cancelled) console.warn('[file] signed-url:', e?.message ?? e); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 bg-slate-100 rounded text-xs mr-1">
      {isImage && url
        ? <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={fileName} className="w-10 h-10 object-cover rounded" />
          </a>
        : <FileImage size={14} className="text-slate-500" />}
      {!isImage && url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{fileName}</a>
      )}
      {onRemove && (
        <button onClick={onRemove} className="text-slate-400 hover:text-rose-600">
          <X size={12} />
        </button>
      )}
    </div>
  );
}
