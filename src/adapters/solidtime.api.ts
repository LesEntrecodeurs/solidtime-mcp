import axios, { AxiosInstance } from 'axios';
import { TimeTracker } from '../ports/time-tracker.js';
import {
  CreateTimeEntryInput,
  ListTimeEntriesFilters,
  SolidTimeClient,
  SolidTimeMember,
  SolidTimeProject,
  SolidTimeTag,
  SolidTimeTask,
  SolidTimeTimeEntry,
  UpdateTimeEntryInput
} from '../shared/types.js';

export class SolidTimeService extends TimeTracker {
  private fetcher: AxiosInstance;
  private orgId: string;

  constructor() {
    super();
    const apiUrl = process.env.SOLIDTIME_API_URL;
    const apiKey = process.env.SOLIDTIME_API_KEY;
    const orgId = process.env.SOLIDTIME_ORG_ID;

    if (!apiUrl) throw new Error('SOLIDTIME_API_URL is required');
    if (!apiKey) throw new Error('SOLIDTIME_API_KEY is required');
    if (!orgId) throw new Error('SOLIDTIME_ORG_ID is required');

    this.orgId = orgId;
    this.fetcher = axios.create({
      baseURL: `${apiUrl.replace(/\/+$/, '')}/api/v1`,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  private orgPath(suffix: string): string {
    return `/organizations/${this.orgId}${suffix}`;
  }

  private async getAllPaginated<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    while (true) {
      const { data } = await this.fetcher.get(path, { params: { page } });
      const items: T[] = data?.data ?? [];
      out.push(...items);
      const lastPage = data?.meta?.last_page ?? 1;
      if (page >= lastPage) break;
      page += 1;
    }
    return out;
  }

  async listProjects(): Promise<SolidTimeProject[]> {
    return this.getAllPaginated<SolidTimeProject>(this.orgPath('/projects'));
  }

  async listMembers(): Promise<SolidTimeMember[]> {
    return this.getAllPaginated<SolidTimeMember>(this.orgPath('/members'));
  }

  async listClients(): Promise<SolidTimeClient[]> {
    return this.getAllPaginated<SolidTimeClient>(this.orgPath('/clients'));
  }

  async listTasks(projectId?: string): Promise<SolidTimeTask[]> {
    const all = await this.getAllPaginated<SolidTimeTask>(
      this.orgPath('/tasks')
    );
    return projectId ? all.filter((t) => t.project_id === projectId) : all;
  }

  async listTags(): Promise<SolidTimeTag[]> {
    return this.getAllPaginated<SolidTimeTag>(this.orgPath('/tags'));
  }

  async listTimeEntries(
    filters: ListTimeEntriesFilters
  ): Promise<SolidTimeTimeEntry[]> {
    const params: Record<string, unknown> = {};
    if (filters.member_id) params.member_id = filters.member_id;
    if (filters.member_ids?.length) params.member_ids = filters.member_ids;
    if (filters.project_ids?.length) params.project_ids = filters.project_ids;
    if (filters.client_ids?.length) params.client_ids = filters.client_ids;
    if (filters.task_ids?.length) params.task_ids = filters.task_ids;
    if (filters.tag_ids?.length) params.tag_ids = filters.tag_ids;
    if (filters.start) params.start = filters.start;
    if (filters.end) params.end = filters.end;
    if (filters.active !== undefined) params.active = String(filters.active);
    if (filters.billable !== undefined)
      params.billable = String(filters.billable);
    if (filters.limit !== undefined) params.limit = filters.limit;
    if (filters.offset !== undefined) params.offset = filters.offset;
    if (filters.only_full_dates !== undefined)
      params.only_full_dates = String(filters.only_full_dates);

    const { data } = await this.fetcher.get(this.orgPath('/time-entries'), {
      params
    });
    return data?.data ?? [];
  }

  async getActiveTimer(memberId?: string): Promise<SolidTimeTimeEntry | null> {
    if (!memberId) {
      try {
        const { data } = await this.fetcher.get('/users/me/time-entries/active');
        return data?.data ?? null;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    }
    const entries = await this.listTimeEntries({
      member_id: memberId,
      active: true,
      limit: 1
    });
    return entries[0] ?? null;
  }

  async createTimeEntry(
    input: CreateTimeEntryInput
  ): Promise<SolidTimeTimeEntry> {
    const { data } = await this.fetcher.post(
      this.orgPath('/time-entries'),
      input
    );
    return data?.data;
  }

  async updateTimeEntry(
    id: string,
    input: UpdateTimeEntryInput
  ): Promise<SolidTimeTimeEntry> {
    const { data } = await this.fetcher.put(
      this.orgPath(`/time-entries/${id}`),
      input
    );
    return data?.data;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await this.fetcher.delete(this.orgPath(`/time-entries/${id}`));
  }
}
