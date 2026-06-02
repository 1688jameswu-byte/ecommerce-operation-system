import type {
  OperatorSalaryStatisticRow,
  SalaryFinancialDetail,
  SalaryFinancialDetailPage,
  SalaryFinancialImportBatch,
  SalaryFinancialImportListResponse,
  SalaryFinancialStoreSummary,
} from '../types/salary';

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const data = JSON.parse(text) as { message?: string; error?: string };
      throw new Error(data.message || data.error || text);
    } catch (error) {
      if (error instanceof Error && error.message !== text) {
        throw error;
      }
      throw new Error(text || '薪资财务数据请求失败');
    }
  }

  return response.json() as Promise<T>;
}

export const salaryFinancialDataSource = {
  loadImportBatches(params: { platform?: string; storeId?: string; period?: string; page?: number; pageSize?: number }) {
    return request<SalaryFinancialImportListResponse>(`/api/salary/financial-imports${buildQuery(params)}`);
  },

  saveImportBatch(payload: {
    batch: Omit<SalaryFinancialImportBatch, 'id' | 'importedAt'> & { id?: string; importedAt?: string };
    details: Array<Omit<SalaryFinancialDetail, 'id' | 'importBatchId' | 'createdAt'> & { id?: string; importBatchId?: string; createdAt?: string }>;
  }) {
    return request<{ ok: true; batch: SalaryFinancialImportBatch }>('/api/salary/financial-imports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteImportBatch(batchId: string) {
    return request<{ ok: true }>('/api/salary/financial-imports/' + encodeURIComponent(batchId), {
      method: 'DELETE',
    });
  },

  loadBatchDetails(batchId: string, params: { page?: number; pageSize?: number }) {
    return request<SalaryFinancialDetailPage>(`/api/salary/financial-imports/${encodeURIComponent(batchId)}/details${buildQuery(params)}`);
  },

  loadFinancialSummaries(params: { period?: string; platform?: string; storeId?: string }) {
    return request<{ records: SalaryFinancialStoreSummary[] }>(`/api/salary/financial-summaries${buildQuery(params)}`);
  },

  loadOperatorSalaryStatistics(params: { period?: string; operatorId?: string; storeId?: string }) {
    return request<{ records: OperatorSalaryStatisticRow[] }>(`/api/salary/operator-salary-statistics${buildQuery(params)}`);
  },
};
