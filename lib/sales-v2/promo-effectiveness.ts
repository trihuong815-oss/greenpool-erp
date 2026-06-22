// PR-TK4C (2026-06-22) — Pure compute helper đánh giá HIỆU QUẢ TƯƠNG ĐỐI khuyến mãi.
//
// ⚠️ LIMITATION quan trọng — đây CHƯA phải ROI thật vì:
//   - Chưa tính chi phí quảng cáo (Facebook Ads, Google Ads, ...)
//   - Chưa tính chi phí quà tặng vật lý
//   - Chưa tính chi phí vận hành (nhân sự promo, in voucher, ...)
//   - Chưa tính biên lợi nhuận thật của gói (chỉ thấy doanh số bán)
//   - Chưa phân biệt khách mới vs khách cũ
// → Đây chỉ là "hiệu quả tương đối" trong tháng — phân loại để gợi ý
//   chương trình nào nên ưu tiên xem lại / duy trì.
//
// Pure function — không gọi Firestore. Test được standalone.

export type PromoClassification = 'high' | 'normal' | 'review' | 'insufficient_data';

export interface PromoEffectivenessRow {
  code: string;
  name: string;
  type: string;
  transactionCount: number;
  promoSales: number;
  totalDiscount: number;
  bonusSessions: number;
  bonusDays: number;
  /** % chi phí khuyến mãi trên doanh số = totalDiscount / promoSales * 100. 0 nếu sales=0. */
  costRatio: number;
  /** Average Revenue Per Customer = promoSales / transactionCount. 0 nếu count=0. */
  arpc: number;
  /** Tỷ trọng doanh số = promoSales / totalSystemSales * 100. 0 nếu totalSystemSales=0. */
  salesShare: number;
  /** Score relative ranking trong tháng — promoSales chuẩn hóa 0-100. */
  effectivenessScore: number;
  classification: PromoClassification;
  recommendation: string;
}

interface PromoInput {
  code: string;
  name: string;
  type: string;
  count: number;
  discount: number;
  bonusSessions: number;
  bonusDays: number;
  sales?: number;  // PR-TK4C — có thể undefined nếu API cũ chưa expose
}

// Ngưỡng chốt theo anh (PR-TK4C spec)
const COST_RATIO_HIGH = 15;       // < 15% → high (kèm sales ≥ median + count ≥ 5)
const COST_RATIO_REVIEW = 30;     // > 30% → review (kèm sales < median + count ≥ 5)
const MIN_SAMPLE_SIZE = 5;        // < 5 GD → insufficient_data

const RECOMMENDATION_LABEL: Record<PromoClassification, string> = {
  high: 'Nên duy trì',
  normal: 'Theo dõi tiếp',
  review: 'Cần xem lại',
  insufficient_data: 'Cần thêm dữ liệu',
};

/** Median helper — empty array → 0. Pure. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Build effectiveness rows từ promoByCode + totalSystemSales.
 *  Sort theo promoSales DESC.
 *  Handle: empty input, sales=0, discount=0, count=0, totalSystemSales=0. */
export function buildPromoEffectiveness(
  promoByCode: Record<string, PromoInput> | undefined,
  totalSystemSales: number,
): PromoEffectivenessRow[] {
  if (!promoByCode) return [];
  const entries = Object.values(promoByCode);
  if (entries.length === 0) return [];

  // Median doanh số (loại 0 để median không bị kéo xuống nếu 1 promo chưa có sales attribution)
  const salesArr = entries.map((p) => Number(p.sales ?? 0)).filter((v) => v > 0);
  const salesMedian = median(salesArr);

  // Max sales cho effectivenessScore normalization
  const maxSales = entries.reduce((m, p) => Math.max(m, Number(p.sales ?? 0)), 0);

  return entries
    .map((p) => {
      const promoSales = Number(p.sales ?? 0);
      const totalDiscount = Number(p.discount ?? 0);
      const count = Number(p.count ?? 0);
      const costRatio = promoSales > 0 ? (totalDiscount / promoSales) * 100 : 0;
      const arpc = count > 0 ? promoSales / count : 0;
      const salesShare = totalSystemSales > 0 ? (promoSales / totalSystemSales) * 100 : 0;
      const effectivenessScore = maxSales > 0 ? (promoSales / maxSales) * 100 : 0;

      // Classification logic (theo spec anh chốt)
      let classification: PromoClassification;
      if (count < MIN_SAMPLE_SIZE) {
        classification = 'insufficient_data';
      } else if (costRatio < COST_RATIO_HIGH && promoSales >= salesMedian) {
        classification = 'high';
      } else if (costRatio > COST_RATIO_REVIEW && promoSales < salesMedian) {
        classification = 'review';
      } else {
        classification = 'normal';
      }

      return {
        code: p.code,
        name: p.name,
        type: p.type,
        transactionCount: count,
        promoSales,
        totalDiscount,
        bonusSessions: Number(p.bonusSessions ?? 0),
        bonusDays: Number(p.bonusDays ?? 0),
        costRatio,
        arpc,
        salesShare,
        effectivenessScore,
        classification,
        recommendation: RECOMMENDATION_LABEL[classification],
      };
    })
    .sort((a, b) => b.promoSales - a.promoSales);
}
