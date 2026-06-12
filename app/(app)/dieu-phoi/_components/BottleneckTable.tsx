'use client';

type BottleneckRow = {
  name: string;
  initials: string;
  holding: number;
  days: number;
  content: string;
};

const ROWS: BottleneckRow[] = [
  { name: 'TP Đào tạo', initials: 'DT', holding: 4, days: 2.5, content: 'Xác nhận lịch lớp hè' },
  { name: 'TP Nhân sự', initials: 'NS', holding: 3, days: 1.8, content: 'Xác nhận HLV mới' },
  { name: 'TP Kế toán', initials: 'KE', holding: 2, days: 3.2, content: 'Duyệt chứng từ chi phí' },
  { name: 'QLCS Linh Đàm', initials: 'LD', holding: 2, days: 1.2, content: 'Báo cáo sửa chữa bể' },
  { name: 'TP Marketing', initials: 'MK', holding: 2, days: 2.0, content: 'Banner tuyển sinh' },
];

export default function BottleneckTable() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-rose-50/60 px-4 py-2.5 border-b border-rose-100">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
            ĐIỂM NGHẼN HIỆN TẠI
          </h3>
          <button type="button" className="text-xs text-emerald-600 hover:underline">
            Xem tất cả
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(140px,1.2fr)_70px_90px_1.5fr] gap-3 px-4 py-2 border-b border-slate-200 text-[10px] uppercase text-slate-400 tracking-wider">
        <div>Người / Đơn vị</div>
        <div>Đang giữ</div>
        <div>Chờ lâu nhất</div>
        <div>Nội dung đang chờ</div>
      </div>

      <div>
        {ROWS.map((row, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[minmax(140px,1.2fr)_70px_90px_1.5fr] gap-3 px-4 py-2.5 items-center hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                {row.initials}
              </span>
              <span className="font-medium text-slate-800 truncate">{row.name}</span>
            </div>
            <div className="tabular-nums text-slate-700">{row.holding} việc</div>
            <div className="text-rose-600 font-semibold tabular-nums">{row.days} ngày</div>
            <div className="text-slate-600 truncate">{row.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
