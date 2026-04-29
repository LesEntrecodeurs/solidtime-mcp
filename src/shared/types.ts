export interface SolidTimeProject {
  id: string;
  name: string;
  color: string;
  client_id: string | null;
  is_archived: boolean;
  is_billable: boolean;
  billable_rate: number | null;
  estimated_time: number | null;
  spent_time: number;
  is_public: boolean;
}

export interface SolidTimeMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_placeholder: boolean;
  billable_rate: number | null;
}

export interface SolidTimeClient {
  id: string;
  name: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SolidTimeTask {
  id: string;
  name: string;
  project_id: string;
  is_done: boolean;
  estimated_time: number | null;
  spent_time: number;
}

export interface SolidTimeTag {
  id: string;
  name: string;
  organization_id: string;
}

export interface SolidTimeTimeEntry {
  id: string;
  start: string;
  end: string | null;
  duration: number | null;
  description: string;
  task_id: string | null;
  project_id: string | null;
  organization_id: string;
  user_id: string;
  member_id?: string;
  tags: string[];
  billable: boolean;
}

export interface CreateTimeEntryInput {
  member_id: string;
  start: string;
  end?: string | null;
  billable: boolean;
  description?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  tags?: string[] | null;
}

export interface UpdateTimeEntryInput {
  member_id?: string;
  start?: string;
  end?: string | null;
  billable?: boolean;
  description?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  tags?: string[] | null;
}

export interface ListTimeEntriesFilters {
  member_id?: string;
  member_ids?: string[];
  project_ids?: string[];
  client_ids?: string[];
  task_ids?: string[];
  tag_ids?: string[];
  start?: string;
  end?: string;
  active?: boolean;
  billable?: boolean;
  limit?: number;
  offset?: number;
  only_full_dates?: boolean;
}

export interface UserMapping {
  name: string;
  discordId: string;
  solidtime: {
    memberId: string;
    userId: string;
  };
  locale?: string;
  timezone?: string;
  offDays?: string[];
}

export type FormattedTimeEntry = {
  id: string;
  projectId: string | null;
  projectName: string;
  description: string;
  start: string;
  end: string | null;
  startLabel: string;
  endLabel: string;
  durationSeconds: number;
  durationLabel: string;
};