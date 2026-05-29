'use client';

// Avatar cropper: chọn file → modal hiện ảnh trong khung tròn 1:1
// → kéo thả + zoom để chọn vùng → confirm → output 512x512 PNG blob
// → upload qua /api/personal/avatar.
//
// Vanilla TS, không cần thư viện ngoài. Touch + mouse support.

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, ZoomIn, ZoomOut, Check, RotateCcw } from 'lucide-react';

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => Promise<void> | void;
}

const VIEW_SIZE = 280;       // kích thước khung crop hiển thị (px)
const OUTPUT_SIZE = 512;     // output square PNG size

export function AvatarCropper({ file, onCancel, onConfirm }: Props) {
  const [imgUrl, setImgUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);      // 1 = ảnh fit khít vào khung
  const [pos, setPos] = useState({ x: 0, y: 0 }); // translate offset
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load file → object URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Khi ảnh load xong, đặt scale=1 (fit khít) và center
  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    // baseScale: fit khít → ảnh width = VIEW_SIZE (hoặc height nếu portrait)
    // → start zoom 1
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  // Pointer (mouse + touch) drag
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
  }
  function onPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function zoomIn() { setScale((s) => Math.min(s + 0.2, 4)); }
  function zoomOut() { setScale((s) => Math.max(s - 0.2, 0.5)); }
  function reset() { setScale(1); setPos({ x: 0, y: 0 }); }

  // Tính baseScale để ảnh fit khít khung (giống object-cover)
  function computeBaseScale(): number {
    if (!naturalSize) return 1;
    return Math.max(VIEW_SIZE / naturalSize.w, VIEW_SIZE / naturalSize.h);
  }

  async function handleConfirm() {
    if (!imgRef.current || !naturalSize) return;
    setSaving(true);
    try {
      // Tính canvas output:
      // Khung view có size VIEW_SIZE. Ảnh được scale (base * scale) và translate (pos.x, pos.y).
      // Crop output = vùng VIEW_SIZE x VIEW_SIZE từ ảnh gốc.
      // Đảo ngược transform: source rect trên ảnh gốc:
      //   - displayed width = naturalSize.w * base * scale
      //   - displayed image top-left ở: (VIEW_SIZE - displayed.w)/2 + pos.x, ...
      //   - crop window relative to image's top-left:
      const base = computeBaseScale();
      const totalScale = base * scale;
      const displayW = naturalSize.w * totalScale;
      const displayH = naturalSize.h * totalScale;
      const imgLeft = (VIEW_SIZE - displayW) / 2 + pos.x;
      const imgTop = (VIEW_SIZE - displayH) / 2 + pos.y;
      // Crop window = [0..VIEW_SIZE] relative to view.
      // Source rect on original image = (0 - imgLeft)/totalScale, (0 - imgTop)/totalScale, VIEW_SIZE/totalScale
      const srcX = -imgLeft / totalScale;
      const srcY = -imgTop / totalScale;
      const srcSize = VIEW_SIZE / totalScale;

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas không khả dụng');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(
        imgRef.current,
        Math.max(0, srcX), Math.max(0, srcY),
        Math.min(srcSize, naturalSize.w - Math.max(0, srcX)),
        Math.min(srcSize, naturalSize.h - Math.max(0, srcY)),
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
      );
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Không tạo được ảnh')), 'image/jpeg', 0.9);
      });
      await onConfirm(blob);
    } catch (e: any) {
      console.error('crop error:', e?.message);
      setSaving(false);
    }
  }

  const base = computeBaseScale();
  const totalScale = base * scale;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Cắt ảnh đại diện</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500 mb-3 text-center">
            Kéo để di chuyển · zoom để chỉnh vùng hiển thị
          </div>

          {/* Crop viewport (square 280x280) */}
          <div
            className="relative mx-auto bg-slate-900 overflow-hidden touch-none select-none cursor-move"
            style={{ width: VIEW_SIZE, height: VIEW_SIZE, borderRadius: '50%' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgUrl && (
              <img
                ref={imgRef}
                src={imgUrl}
                alt=""
                draggable={false}
                onLoad={handleImgLoad}
                className="absolute pointer-events-none"
                style={{
                  left: '50%', top: '50%',
                  width: naturalSize ? `${naturalSize.w * totalScale}px` : 'auto',
                  height: naturalSize ? `${naturalSize.h * totalScale}px` : 'auto',
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                  maxWidth: 'none', maxHeight: 'none',
                }}
              />
            )}
            {/* Decorative ring overlay */}
            <div className="absolute inset-0 ring-4 ring-white/40 rounded-full pointer-events-none" />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={zoomOut} disabled={saving}
              className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              aria-label="Thu nhỏ"
            >
              <ZoomOut size={16} />
            </button>
            <input
              type="range" min={50} max={400} step={5}
              value={scale * 100}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
              disabled={saving}
              className="flex-1 max-w-[180px] accent-emerald-600"
            />
            <button
              onClick={zoomIn} disabled={saving}
              className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              aria-label="Phóng to"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={reset} disabled={saving}
              className="p-2 rounded-lg ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              aria-label="Reset"
              title="Reset về vị trí ban đầu"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
            Huỷ
          </button>
          <button
            onClick={handleConfirm} disabled={saving || !naturalSize}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Lưu ảnh
          </button>
        </div>
      </div>
    </div>
  );
}
