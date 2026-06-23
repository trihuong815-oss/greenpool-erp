// PR-CASH1C (2026-06-23) — Typed API client cho UI /chi-phi-co-so.
// Thin wrapper quanh fetch() — không cache, không retry, mỗi handler tự quyết.

import type { BranchId } from '@/lib/branches';
import type {
  BranchDailyExpenseDoc,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpensePaymentMethod,
} from '@/lib/finance/expense-types';
import type {
  DailyCashflowReportDoc,
  CashflowAlertCode,
} from '@/lib/finance/cashflow-report-types';

export type ExpenseDoc = BranchDailyExpenseDoc & { id: string };

export interface SubmitReportSummary {
  revenue: { cash: number; transfer: number; card: number; other: number; total: number };
  expense: { cash: number; transfer: number; card: number; other: number; total: number };
  net:     { cash: number; transfer: number; card: number; other: number; total: number };
  alerts: number;
  sentToCount: number;
}

export interface SubmitReportResponse {
  ok: true;
  reportId: string;
  reportVersion: number;
  status: 'submitted' | 'sent';
  summary: SubmitReportSummary;
}

async function jsonOrError(r: Response): Promise<any> {
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) {
    const msg = (body && typeof body === 'object' && body.error) ? body.error : `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status, body });
  }
  return body;
}

export async function listExpenses(date: string, branchId: BranchId): Promise<{ ok: true; count: number; expenses: ExpenseDoc[] }> {
  const r = await fetch(`/api/finance/expenses?date=${encodeURIComponent(date)}&branchId=${encodeURIComponent(branchId)}`);
  return jsonOrError(r);
}

export async function createExpense(input: CreateExpenseInput): Promise<{ ok: true; expense: ExpenseDoc }> {
  const r = await fetch('/api/finance/expenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return jsonOrError(r);
}

export async function updateExpense(id: string, input: UpdateExpenseInput): Promise<{ ok: true; expense: ExpenseDoc }> {
  const r = await fetch(`/api/finance/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return jsonOrError(r);
}

export async function recordExpense(id: string): Promise<{ ok: true; expense?: ExpenseDoc; status?: string }> {
  const r = await fetch(`/api/finance/expenses/${encodeURIComponent(id)}?action=record`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return jsonOrError(r);
}

export async function deleteDraftExpense(id: string): Promise<{ ok: true }> {
  const r = await fetch(`/api/finance/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return jsonOrError(r);
}

export interface ListReportsParams {
  date?: string;
  month?: string;
  branchId?: BranchId | null;
  status?: string;
}

export async function listCashflowReports(
  paramsOrDate: ListReportsParams | string,
  branchId?: BranchId,
): Promise<{ ok: true; count: number; reports: Array<DailyCashflowReportDoc & { id: string }> }> {
  const qs = new URLSearchParams();
  if (typeof paramsOrDate === 'string') {
    qs.set('date', paramsOrDate);
    if (branchId) qs.set('branchId', branchId);
  } else {
    if (paramsOrDate.date) qs.set('date', paramsOrDate.date);
    if (paramsOrDate.month) qs.set('month', paramsOrDate.month);
    if (paramsOrDate.branchId) qs.set('branchId', paramsOrDate.branchId);
    if (paramsOrDate.status) qs.set('status', paramsOrDate.status);
  }
  const r = await fetch(`/api/finance/cashflow-reports?${qs.toString()}`);
  return jsonOrError(r);
}

export async function getCashflowReport(id: string): Promise<{ ok: true; report: DailyCashflowReportDoc & { id: string } }> {
  const r = await fetch(`/api/finance/cashflow-reports/${encodeURIComponent(id)}`);
  return jsonOrError(r);
}

export async function checkCashflowReport(id: string, note?: string): Promise<{ ok: true; status: string }> {
  const r = await fetch(`/api/finance/cashflow-reports/${encodeURIComponent(id)}/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note: note ?? '' }),
  });
  return jsonOrError(r);
}

export async function returnCashflowReport(id: string, reason: string): Promise<{ ok: true; status: string }> {
  const r = await fetch(`/api/finance/cashflow-reports/${encodeURIComponent(id)}/return`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return jsonOrError(r);
}

export async function submitDailyCashflowReport(date: string, branchId: BranchId): Promise<SubmitReportResponse> {
  const r = await fetch('/api/finance/cashflow-reports/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, branchId }),
  });
  return jsonOrError(r);
}

// Re-export types for component convenience
export type { ExpensePaymentMethod, CashflowAlertCode };
