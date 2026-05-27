// Typed client-side wrappers gọi /api/checklist/*
// Dùng trong client components thay cho supabase.from() trực tiếp.

export interface AuditLogRow {
  id: string;
  instance_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const checklistApi = {
  async listAudit(instanceId: string): Promise<AuditLogRow[]> {
    const res = await fetch(`/api/checklist/instances/${encodeURIComponent(instanceId)}/audit`, {
      cache: 'no-store',
    });
    const data = await jsonOrThrow<{ rows: AuditLogRow[] }>(res);
    return data.rows;
  },

  async logAudit(instanceId: string, action: string, details?: Record<string, unknown>): Promise<void> {
    const res = await fetch(`/api/checklist/instances/${encodeURIComponent(instanceId)}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, details: details ?? null }),
    });
    await jsonOrThrow<{ id: string }>(res);
  },

  async patchInstance(
    instanceId: string,
    patch: Record<string, unknown>,
  ): Promise<{ instance: Record<string, any> }> {
    const res = await fetch(`/api/checklist/instances/${encodeURIComponent(instanceId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    return jsonOrThrow<{ instance: Record<string, any> }>(res);
  },

  async patchItem(
    instanceId: string,
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(
      `/api/checklist/instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      },
    );
    await jsonOrThrow<{ ok: true }>(res);
  },

  async toggleItem(
    instanceId: string,
    itemId: string,
    checked: boolean,
    itemContent?: string,
  ): Promise<{ status: string }> {
    const res = await fetch(
      `/api/checklist/instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/toggle`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked, item_content: itemContent }),
      },
    );
    return jsonOrThrow<{ ok: true; status: string }>(res);
  },

  async uploadFile(
    instanceId: string,
    itemId: string,
    file: File,
  ): Promise<{ path: string; file_urls: string[] }> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `/api/checklist/instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/files`,
      { method: 'POST', body: form },
    );
    return jsonOrThrow<{ ok: true; path: string; file_urls: string[] }>(res);
  },

  async removeFile(
    instanceId: string,
    itemId: string,
    path: string,
  ): Promise<{ file_urls: string[] }> {
    const res = await fetch(
      `/api/checklist/instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/files`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      },
    );
    return jsonOrThrow<{ ok: true; file_urls: string[] }>(res);
  },

  async getSignedUrl(path: string): Promise<string> {
    const res = await fetch('/api/checklist/files/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await jsonOrThrow<{ url: string; expiresInMs: number }>(res);
    return data.url;
  },

  // ---- Templates ----
  async listTemplates(filter: { block?: string; dept?: string } = {}): Promise<Record<string, any>[]> {
    const qs = new URLSearchParams();
    if (filter.block) qs.set('block', filter.block);
    if (filter.dept) qs.set('dept', filter.dept);
    const url = `/api/checklist/templates${qs.toString() ? '?' + qs.toString() : ''}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await jsonOrThrow<{ rows: Record<string, any>[] }>(res);
    return data.rows;
  },

  async createTemplate(payload: Record<string, unknown>): Promise<Record<string, any>> {
    const res = await fetch('/api/checklist/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    const data = await jsonOrThrow<{ template: Record<string, any> }>(res);
    return data.template;
  },

  async updateTemplate(id: string, patch: Record<string, unknown>): Promise<Record<string, any>> {
    const res = await fetch(`/api/checklist/templates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    const data = await jsonOrThrow<{ template: Record<string, any> }>(res);
    return data.template;
  },

  async deleteTemplate(id: string): Promise<void> {
    const res = await fetch(`/api/checklist/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await jsonOrThrow<{ ok: true }>(res);
  },

  async listTemplateItems(templateId: string): Promise<Record<string, any>[]> {
    const res = await fetch(`/api/checklist/templates/${encodeURIComponent(templateId)}/items`, {
      cache: 'no-store',
    });
    const data = await jsonOrThrow<{ rows: Record<string, any>[] }>(res);
    return data.rows;
  },

  async createTemplateItem(templateId: string, content: string): Promise<Record<string, any>> {
    const res = await fetch(`/api/checklist/templates/${encodeURIComponent(templateId)}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await jsonOrThrow<{ item: Record<string, any> }>(res);
    return data.item;
  },

  async updateTemplateItem(
    templateId: string, itemId: string, patch: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(
      `/api/checklist/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      },
    );
    await jsonOrThrow<{ ok: true }>(res);
  },

  async deleteTemplateItem(templateId: string, itemId: string): Promise<void> {
    const res = await fetch(
      `/api/checklist/templates/${encodeURIComponent(templateId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    );
    await jsonOrThrow<{ ok: true }>(res);
  },

  async deleteDepartment(deptId: string): Promise<void> {
    const res = await fetch(`/api/admin/departments/${encodeURIComponent(deptId)}`, {
      method: 'DELETE',
    });
    await jsonOrThrow<{ ok: true }>(res);
  },
};
