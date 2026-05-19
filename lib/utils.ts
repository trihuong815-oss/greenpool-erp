import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVND(value: number, unit: 'Tr' | 'Tỷ' | 'auto' = 'auto'): string {
  if (unit === 'Tỷ' || (unit === 'auto' && value >= 1000)) {
    return (value / 1000).toFixed(2) + ' Tỷ';
  }
  return value.toLocaleString('vi-VN') + ' Tr';
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
