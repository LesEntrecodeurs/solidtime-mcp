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

export abstract class TimeTracker {
  abstract listProjects(): Promise<SolidTimeProject[]>;
  abstract listMembers(): Promise<SolidTimeMember[]>;
  abstract listClients(): Promise<SolidTimeClient[]>;
  abstract listTasks(projectId?: string): Promise<SolidTimeTask[]>;
  abstract listTags(): Promise<SolidTimeTag[]>;

  abstract listTimeEntries(
    filters: ListTimeEntriesFilters
  ): Promise<SolidTimeTimeEntry[]>;
  abstract getActiveTimer(
    memberId?: string
  ): Promise<SolidTimeTimeEntry | null>;
  abstract createTimeEntry(
    input: CreateTimeEntryInput
  ): Promise<SolidTimeTimeEntry>;
  abstract updateTimeEntry(
    id: string,
    input: UpdateTimeEntryInput
  ): Promise<SolidTimeTimeEntry>;
  abstract deleteTimeEntry(id: string): Promise<void>;
}
