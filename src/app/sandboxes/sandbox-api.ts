import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SandboxKind = 'generated' | 'saved';

export interface SandboxInfo {
  name: string;
  title: string;
  template: string;
  kind: SandboxKind;
  createdAt: string;
  routePath: string;
}

export interface TemplateInfo {
  id: string;
  label: string;
}

export interface CreatePayload {
  name: string;
  title: string;
  template: string;
}

export interface CreateResult {
  name: string;
  routePath: string;
}

const BASE = '/sandbox-api';

@Injectable({ providedIn: 'root' })
export class SandboxApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<SandboxInfo[]> {
    return this.http.get<SandboxInfo[]>(`${BASE}/list`);
  }

  templates(): Observable<TemplateInfo[]> {
    return this.http.get<TemplateInfo[]>(`${BASE}/templates`);
  }

  create(payload: CreatePayload): Observable<CreateResult> {
    return this.http.post<CreateResult>(`${BASE}/create`, payload);
  }

  remove(name: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${BASE}/${encodeURIComponent(name)}`);
  }

  pin(name: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${BASE}/pin/${encodeURIComponent(name)}`, {});
  }

  unpin(name: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${BASE}/unpin/${encodeURIComponent(name)}`, {});
  }

  wipe(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${BASE}/wipe`, {});
  }
}
