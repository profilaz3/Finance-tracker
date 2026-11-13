import type { Category } from '../types';
import { CONFIG } from '../config';
import { getSupabaseService } from './runtimeServices';
import { validateFiscalReceipt, type FiscalReceipt } from '../utils/fiscalReceipt';

export type { FiscalReceipt } from '../utils/fiscalReceipt';

export type FiscalImportResult =
  | { ok: true; receipt: FiscalReceipt }
  | { ok: false; reason: 'notFiscal' | 'offline' | 'unavailable' | 'failed' };

const errorStatus = async (error: unknown): Promise<{ status?: number; code?: string }> => {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return {};
  let code: string | undefined;
  try {
    const body: unknown = await context.clone().json();
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      code = (body as { error: string }).error;
    }
  } catch {
    // Non-JSON error body
  }
  return { status: context.status, code };
};

/**
 * Imports a Serbian fiscal receipt from the URL in its QR code via the `fiscal-receipt`
 * edge function (the tax portal does not allow browser requests).
 */
export async function importFiscalReceipt(url: string, categories: Category[]): Promise<FiscalImportResult> {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return { ok: false, reason: 'unavailable' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };

  try {
    const supabaseService = await getSupabaseService();
    const { data, error } = await supabaseService.client.functions.invoke('fiscal-receipt', {
      body: {
        url,
        // Names and types only: the function suggests one of these.
        categories: categories.filter(c => c.type === 'expense').map(c => ({ name: c.name, type: c.type })),
      },
    });
    if (error) {
      const { status, code } = await errorStatus(error);
      if (code === 'not_fiscal') return { ok: false, reason: 'notFiscal' };
      if (status === undefined) return { ok: false, reason: 'offline' };
      return { ok: false, reason: 'failed' };
    }
    const payload = data && typeof data === 'object' && 'data' in data ? (data as { data: unknown }).data : data;
    const receipt = validateFiscalReceipt(payload);
    return receipt ? { ok: true, receipt } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
