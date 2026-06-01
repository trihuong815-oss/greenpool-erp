// Sticker pack 'gp' (Green Pool) — Phase 13.4.
// MVP: dùng emoji ghép thay vì ảnh thật → không cần asset, deploy ngay.
// Sau này muốn dùng PNG/Lottie thì thay `glyph` bằng `imageUrl`.

export interface StickerDef {
  id: string;
  glyph: string;          // emoji string (có thể dài: '👍🎉')
  label: string;
}

export const STICKER_PACK_ID = 'gp';

export const STICKER_PACK: StickerDef[] = [
  { id: 'thumbs-up',    glyph: '👍',  label: 'OK' },
  { id: 'heart',        glyph: '❤️',  label: 'Yêu thích' },
  { id: 'fire',         glyph: '🔥',  label: 'Tuyệt vời' },
  { id: 'party',        glyph: '🎉',  label: 'Chúc mừng' },
  { id: 'clap',         glyph: '👏',  label: 'Hoan hô' },
  { id: 'rocket',       glyph: '🚀',  label: 'Bùng nổ' },
  { id: 'thinking',     glyph: '🤔',  label: 'Suy nghĩ' },
  { id: 'pray',         glyph: '🙏',  label: 'Cảm ơn' },
  { id: 'sweat',        glyph: '😅',  label: 'Ngại quá' },
  { id: 'laugh',        glyph: '😂',  label: 'Cười' },
  { id: 'love-eyes',    glyph: '😍',  label: 'Mê' },
  { id: 'sleep',        glyph: '😴',  label: 'Buồn ngủ' },
];

export function findSticker(id: string): StickerDef | undefined {
  return STICKER_PACK.find((s) => s.id === id);
}
