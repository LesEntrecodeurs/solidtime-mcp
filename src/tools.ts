import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TimeTracker } from './ports/time-tracker.js';
import {
  findUserByDiscordId,
  findUserByMemberId,
  findUserByName,
  loadUsers
} from './shared/users.js';
import {
  EnrichedEntry,
  FormatContext,
  enrichEntry,
  summarizeEntries,
  summarizeEntry,
  timezoneForMember
} from './shared/format.js';
import {
  SolidTimeClient,
  SolidTimeProject,
  SolidTimeTask,
  SolidTimeTimeEntry
} from './shared/types.js';

import { logger } from "./lib/logger.js"

const CACHE_TTL_MS = 60_000;

// Convertit une Date ou une string ISO en format UTC compatible SolidTime.
function toSolidTimeDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Retourne la date actuelle au format UTC compatible SolidTime.
function nowSolidTime(): string {
  return toSolidTimeDate(new Date());
}

// Construit une réponse MCP d’erreur standardisée.
const errorPayload = (msg: string) => ({
  content: [{ type: 'text' as const, text: msg }],
  isError: true,
  structuredContent: { error: msg }
});

// Représente une entrée de cache avec son timestamp de création.
interface CacheEntry<T> {
  at: number;
  data: T;
}

export class Tools {
  private projectsCache: CacheEntry<Map<string, SolidTimeProject>> | null = null;
  private clientsCache: CacheEntry<Map<string, SolidTimeClient>> | null = null;
  private tasksCache: CacheEntry<Map<string, SolidTimeTask>> | null = null;

  constructor(
    public server: McpServer,
    private tracker: TimeTracker
  ) {}

  // Initialise tous les groupes d’outils MCP.
  async hydrate() {
    console.error('[MCP] hydrate:start');

    this.registerListTools();
    console.error('[MCP] hydrate:listTools registered');

    this.registerUserTools();
    console.error('[MCP] hydrate:userTools registered');

    this.registerTimeEntryTools();
    console.error('[MCP] hydrate:timeEntryTools registered');

    console.error('[MCP] hydrate:done');
  }

  // Récupère les projets SolidTime et les met en cache temporairement.
  private async getProjectsMap(): Promise<Map<string, SolidTimeProject>> {
    if (
      this.projectsCache &&
      Date.now() - this.projectsCache.at < CACHE_TTL_MS
    ) {
      return this.projectsCache.data;
    }
    const list = await this.tracker.listProjects();
    const map = new Map(list.map((p) => [p.id, p]));
    this.projectsCache = { at: Date.now(), data: map };
    return map;
  }

  // Récupère les clients SolidTime et les met en cache temporairement.
  private async getClientsMap(): Promise<Map<string, SolidTimeClient>> {
    if (this.clientsCache && Date.now() - this.clientsCache.at < CACHE_TTL_MS) {
      return this.clientsCache.data;
    }
    const list = await this.tracker.listClients();
    const map = new Map(list.map((c) => [c.id, c]));
    this.clientsCache = { at: Date.now(), data: map };
    return map;
  }

  // Récupère les tâches SolidTime et les met en cache temporairement.
  private async getTasksMap(): Promise<Map<string, SolidTimeTask>> {
    if (this.tasksCache && Date.now() - this.tasksCache.at < CACHE_TTL_MS) {
      return this.tasksCache.data;
    }
    const list = await this.tracker.listTasks();
    const map = new Map(list.map((t) => [t.id, t]));
    this.tasksCache = { at: Date.now(), data: map };
    return map;
  }

  // Construit le contexte de formatage : fuseau horaire, projets, clients et tâches.
  private async buildFormatContext(
    memberId?: string,
    timezoneOverride?: string,
    options: { withTasks?: boolean } = {}
  ): Promise<FormatContext> {
    const [projectsById, clientsById, tasksById] = await Promise.all([
      this.getProjectsMap(),
      this.getClientsMap(),
      options.withTasks ? this.getTasksMap() : Promise.resolve(new Map())
    ]);
    return {
      tz: timezoneOverride ?? timezoneForMember(memberId),
      projectsById,
      clientsById,
      tasksById
    };
  }

  // Enrichit une entrée de temps avec les informations projet/client/tâche et le fuseau horaire.
  private async enrichOne(
    entry: SolidTimeTimeEntry,
    timezoneOverride?: string
  ): Promise<EnrichedEntry> {
    const ctx = await this.buildFormatContext(
      entry.member_id ?? undefined,
      timezoneOverride,
      { withTasks: !!entry.task_id }
    );
    return enrichEntry(entry, ctx);
  }

  // Enregistre les outils MCP de listing global : projets, membres, clients, tâches et tags.
  private registerListTools() {
    // Tool MCP : liste tous les projets de l’organisation SolidTime.
    this.server.registerTool(
      'list_projects',
      {
        title: 'List projects',
        description:
          'List every project in the organization (id, name, color, archived flag, client_id).',
        inputSchema: {},
        outputSchema: { data: z.any() }
      },
      async () => {
        const data = await this.tracker.listProjects();
        return {
          content: [
            { type: 'text', text: `Projets (${data.length}): ${JSON.stringify(data)}` }
          ],
          structuredContent: { data }
        };
      }
    );

    // Tool MCP : liste tous les membres de l’organisation SolidTime.
    this.server.registerTool(
      'list_members',
      {
        title: 'List organization members',
        description:
          'List every member of the SolidTime organization (id is the member_id used by time entries).',
        inputSchema: {},
        outputSchema: { data: z.any() }
      },
      async () => {
        const data = await this.tracker.listMembers();
        return {
          content: [
            { type: 'text', text: `Membres (${data.length}): ${JSON.stringify(data)}` }
          ],
          structuredContent: { data }
        };
      }
    );

    // Tool MCP : liste tous les clients de l’organisation SolidTime.
    this.server.registerTool(
      'list_clients',
      {
        title: 'List clients',
        description: 'List every client in the organization.',
        inputSchema: {},
        outputSchema: { data: z.any() }
      },
      async () => {
        const data = await this.tracker.listClients();
        return {
          content: [
            { type: 'text', text: `Clients (${data.length}): ${JSON.stringify(data)}` }
          ],
          structuredContent: { data }
        };
      }
    );

    // Tool MCP : liste les tâches SolidTime, avec filtre optionnel par project_id.
    this.server.registerTool(
      'list_tasks',
      {
        title: 'List tasks',
        description: 'List tasks. Optionally filter by project_id.',
        inputSchema: {
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe('Filter tasks by SolidTime project_id (UUID).')
        },
        outputSchema: { data: z.any() }
      },
      async ({ projectId }) => {
        const data = await this.tracker.listTasks(projectId);
        return {
          content: [
            { type: 'text', text: `Tasks (${data.length}): ${JSON.stringify(data)}` }
          ],
          structuredContent: { data }
        };
      }
    );

    // Tool MCP : liste tous les tags disponibles dans l’organisation SolidTime.
    this.server.registerTool(
      'list_tags',
      {
        title: 'List tags',
        description: 'List every tag in the organization (UUIDs needed when creating time entries with tags).',
        inputSchema: {},
        outputSchema: { data: z.any() }
      },
      async () => {
        const data = await this.tracker.listTags();
        return {
          content: [
            { type: 'text', text: `Tags (${data.length}): ${JSON.stringify(data)}` }
          ],
          structuredContent: { data }
        };
      }
    );
  }

  // Enregistre les outils MCP liés aux utilisateurs et au mapping Discord <-> SolidTime.
  private registerUserTools() {
    // Tool MCP : liste les utilisateurs connus depuis le mapping local users.json.
    this.server.registerTool(
      'list_known_users',
      {
        title: 'List known users (local mapping)',
        description:
          'List the locally-configured Discord <-> SolidTime user mapping (loaded from users.json).',
        inputSchema: {},
        outputSchema: { data: z.any() }
      },
      async () => {
        const data = loadUsers();
        return {
          content: [
            {
              type: 'text',
              text: `Utilisateurs connus (${data.length}): ${JSON.stringify(data)}`
            }
          ],
          structuredContent: { data }
        };
      }
    );

    // Tool MCP : résout un utilisateur via Discord ID, nom ou memberId SolidTime.
    console.error('[MCP] registering tool:resolve_user');
    this.server.registerTool(
      'resolve_user',
      {
        title: 'Resolve user (Discord ID, name, or memberId)',
        description:
          'Resolve a user from the local mapping. Provide exactly one of: discordId, name, or memberId. Returns the full mapping (including SolidTime memberId).',
        inputSchema: {
          discordId: z.string().optional().describe('Discord user ID'),
          name: z.string().optional().describe('Display name (case-insensitive)'),
          memberId: z.string().uuid().optional().describe('SolidTime member_id (UUID)')
        },
        outputSchema: { data: z.any() }
      },
      async ({ discordId, name, memberId }) => {
        console.error('[MCP][resolve_user] called', {
          discordId,
          name,
          memberId
        });

        let user;

        if (discordId) {
          user = findUserByDiscordId(discordId);
        } else if (name) {
          user = findUserByName(name);
        } else if (memberId) {
          user = findUserByMemberId(memberId);
        } else {
          console.error('[MCP][resolve_user] missing params');

          return errorPayload(
            'Provide one of: discordId, name, memberId.'
          );
        }

        console.error('[MCP][resolve_user] lookup result', {
          found: !!user,
          resolvedName: user?.name,
          resolvedDiscordId: user?.discordId,
          resolvedMemberId: user?.solidtime?.memberId
        });

        if (!user) {
          return errorPayload(
            `No user found for ${JSON.stringify({
              discordId,
              name,
              memberId
            })}`
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(user)
            }
          ],
          structuredContent: { data: user }
        };
      }
    );
  }

  // Enregistre les outils MCP liés aux timers et aux entrées de temps SolidTime.
  private registerTimeEntryTools() {
    console.error('[MCP] registerTimeEntryTools:start');

    // Tool MCP : résume les entrées de temps d’un utilisateur Discord sur une période donnée.
    console.error('[MCP] registering tool:get_time_summary_by_discord_id');
    this.server.registerTool(
      'get_time_summary_by_discord_id',
      {
        title: 'Get time summary by Discord ID',
        description:
          'Return SolidTime time entries summary for a Discord user over a given period.',
        inputSchema: {
          discordId: z.string().describe('Discord user ID from the current message author'),
          start: z.string().describe('ISO 8601 lower bound.'),
          end: z.string().describe('ISO 8601 upper bound.'),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times, e.g. Europe/Paris.')
        },
        outputSchema: { data: z.any() }
      },
      async ({ discordId, start, end, timezone }) => {
        const user = findUserByDiscordId(discordId);

        if (!user) {
          return errorPayload(`No SolidTime mapping found for Discord user ${discordId}`);
        }

        const data = await this.tracker.listTimeEntries({
          member_id: user.solidtime.memberId,
          start: toSolidTimeDate(start),
          end: toSolidTimeDate(end),
          limit: 500
        });

        const needsTasks = data.some((entry) => !!entry.task_id);

        const ctx = await this.buildFormatContext(
          user.solidtime.memberId,
          timezone,
          { withTasks: needsTasks }
        );

        const enriched = data
          .map((entry) => enrichEntry(entry, ctx))
          .sort(
            (a, b) =>
              new Date(a.start).getTime() - new Date(b.start).getTime()
          );

        return {
          content: [
            {
              type: 'text',
              text: summarizeEntries(enriched)
            }
          ],
          structuredContent: {
            data: {
              user: {
                name: user.name,
                discordId: user.discordId,
                memberId: user.solidtime.memberId
              },
              range: {
                start: toSolidTimeDate(start),
                end: toSolidTimeDate(end),
                timezone: timezone ?? timezoneForMember(user.solidtime.memberId)
              },
              entries: enriched
            }
          }
        };
      }
    );

    // Tool MCP : récupère le timer actif d’un utilisateur Discord.
    console.error('[MCP] registering tool:get_active_timer_by_discord_id');
    this.server.registerTool(
      'get_active_timer_by_discord_id',
      {
        title: 'Get active timer by Discord ID',
        description:
          'Return the running time entry for the Discord user. Returns null if no timer is running.',
        inputSchema: {
          discordId: z.string().describe('Discord user ID from the current message author'),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times, e.g. Europe/Paris.')
        },
        outputSchema: { data: z.any() }
      },
      async ({ discordId, timezone }) => {
        const user = findUserByDiscordId(discordId);

        if (!user) {
          return errorPayload(`No SolidTime mapping found for Discord user ${discordId}`);
        }

        const data = await this.tracker.getActiveTimer(user.solidtime.memberId);

        if (!data) {
          return {
            content: [{ type: 'text', text: `Aucun timer actif pour ${user.name}.` }],
            structuredContent: { data: null }
          };
        }

        const enriched = await this.enrichOne(data, timezone);

        return {
          content: [
            { type: 'text', text: `Timer actif:\n- ${summarizeEntry(enriched)}` }
          ],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : démarre un timer SolidTime pour un membre donné.
    console.error('[MCP] registering tool:start_timer');
    this.server.registerTool(
      'start_timer',
      {
        title: 'Start a timer',
        description:
          'Start a running time entry (no end). If a timer is already active for that member it is stopped first. start defaults to now.',
        inputSchema: {
          memberId: z.string().uuid().describe('SolidTime member_id'),
          description: z
            .string()
            .max(5000)
            .optional()
            .describe('Free-text description of what is being worked on'),
          projectId: z.string().uuid().optional().describe('SolidTime project_id'),
          taskId: z
            .string()
            .uuid()
            .optional()
            .describe('SolidTime task_id (requires projectId)'),
          billable: z
            .boolean()
            .default(false)
            .describe('Whether the entry is billable. Defaults to false.'),
          tagIds: z
            .array(z.string().uuid())
            .optional()
            .describe('List of SolidTime tag UUIDs to attach.'),
          start: z
            .string()
            .optional()
            .describe(
              'ISO 8601 start time. Defaults to "now". Will be coerced to UTC "Y-m-d\\TH:i:s\\Z".'
            ),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times (e.g. Europe/Paris).')
        },
        outputSchema: { data: z.any() }
      },
      async ({
        memberId,
        description,
        projectId,
        taskId,
        billable,
        tagIds,
        start,
        timezone
      }) => {
        const existing = await this.tracker.getActiveTimer(memberId);
        if (existing) {
          await this.tracker.updateTimeEntry(existing.id, {
            end: nowSolidTime()
          });
        }

        const created = await this.tracker.createTimeEntry({
          member_id: memberId,
          start: start ? toSolidTimeDate(start) : nowSolidTime(),
          end: null,
          billable: billable ?? false,
          description: description ?? '',
          project_id: projectId ?? null,
          task_id: taskId ?? null,
          tags: tagIds && tagIds.length ? tagIds : null
        });

        const enriched = await this.enrichOne(created, timezone);
        return {
          content: [
            {
              type: 'text',
              text: `Timer démarré:\n- ${summarizeEntry(enriched)}`
            }
          ],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : arrête le timer actif d’un membre donné.
    console.error('[MCP] registering tool:stop_timer');
    this.server.registerTool(
      'stop_timer',
      {
        title: 'Stop the active timer',
        description:
          'Stop the active timer for the given member (or token holder if memberId omitted). No-op if no timer is running.',
        inputSchema: {
          memberId: z.string().uuid().optional(),
          end: z
            .string()
            .optional()
            .describe('ISO 8601 end time. Defaults to "now".'),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times (e.g. Europe/Paris).')
        },
        outputSchema: { data: z.any() }
      },
      async ({ memberId, end, timezone }) => {
        const active = await this.tracker.getActiveTimer(memberId);
        if (!active) {
          return {
            content: [{ type: 'text', text: 'Aucun timer actif à arrêter.' }],
            structuredContent: { data: null }
          };
        }
        const updated = await this.tracker.updateTimeEntry(active.id, {
          end: end ? toSolidTimeDate(end) : nowSolidTime()
        });
        const enriched = await this.enrichOne(updated, timezone);
        return {
          content: [
            { type: 'text', text: `Timer arrêté:\n- ${summarizeEntry(enriched)}` }
          ],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : liste les entrées de temps avec filtres avancés.
    console.error('[MCP] registering tool:list_time_entries');
    this.server.registerTool(
      'list_time_entries',
      {
        title: 'List time entries',
        description:
          'List time entries with optional filters. Dates must be ISO 8601 (will be coerced to UTC). Times in the response are formatted in the user timezone (Europe/Paris by default).',
        inputSchema: {
          memberId: z.string().uuid().optional(),
          memberIds: z.array(z.string().uuid()).optional(),
          projectIds: z.array(z.string().uuid()).optional(),
          clientIds: z.array(z.string().uuid()).optional(),
          taskIds: z.array(z.string().uuid()).optional(),
          tagIds: z.array(z.string().uuid()).optional(),
          start: z.string().optional().describe('ISO 8601 lower bound.'),
          end: z.string().optional().describe('ISO 8601 upper bound.'),
          active: z.boolean().optional(),
          billable: z.boolean().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          offset: z.number().int().min(0).optional(),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times (e.g. Europe/Paris).')
        },
        outputSchema: { data: z.any() }
      },
      async (args) => {
        const data = await this.tracker.listTimeEntries({
          member_id: args.memberId,
          member_ids: args.memberIds,
          project_ids: args.projectIds,
          client_ids: args.clientIds,
          task_ids: args.taskIds,
          tag_ids: args.tagIds,
          start: args.start ? toSolidTimeDate(args.start) : undefined,
          end: args.end ? toSolidTimeDate(args.end) : undefined,
          active: args.active,
          billable: args.billable,
          limit: args.limit,
          offset: args.offset
        });

        const needsTasks = data.some((e) => !!e.task_id);
        const ctx = await this.buildFormatContext(args.memberId, args.timezone, {
          withTasks: needsTasks
        });
        const enriched = data.map((e) => enrichEntry(e, ctx));
        return {
          content: [{ type: 'text', text: summarizeEntries(enriched) }],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : crée une entrée de temps fermée avec début et fin explicites.
    console.error('[MCP] registering tool:create_time_entry');  
    this.server.registerTool(
      'create_time_entry',
      {
        title: 'Create a (closed) time entry',
        description:
          'Create a closed time entry with explicit start and end. For starting a running timer use start_timer instead.',
        inputSchema: {
          memberId: z.string().uuid(),
          start: z.string().describe('ISO 8601 start time'),
          end: z.string().describe('ISO 8601 end time'),
          billable: z.boolean().default(false),
          description: z.string().max(5000).optional(),
          projectId: z.string().uuid().optional(),
          taskId: z.string().uuid().optional(),
          tagIds: z.array(z.string().uuid()).optional(),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times (e.g. Europe/Paris).')
        },
        outputSchema: { data: z.any() }
      },
      async ({
        memberId,
        start,
        end,
        billable,
        description,
        projectId,
        taskId,
        tagIds,
        timezone
      }) => {
        const data = await this.tracker.createTimeEntry({
          member_id: memberId,
          start: toSolidTimeDate(start),
          end: toSolidTimeDate(end),
          billable: billable ?? false,
          description: description ?? '',
          project_id: projectId ?? null,
          task_id: taskId ?? null,
          tags: tagIds && tagIds.length ? tagIds : null
        });
        const enriched = await this.enrichOne(data, timezone);
        return {
          content: [
            { type: 'text', text: `Entrée créée:\n- ${summarizeEntry(enriched)}` }
          ],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : modifie partiellement une entrée de temps existante.
    console.error('[MCP] registering tool:update_time_entry');
    this.server.registerTool(
      'update_time_entry',
      {
        title: 'Update a time entry',
        description: 'Patch an existing time entry. Only provided fields are sent.',
        inputSchema: {
          timeEntryId: z.string().uuid(),
          memberId: z.string().uuid().optional(),
          start: z.string().optional(),
          end: z.string().nullable().optional(),
          billable: z.boolean().optional(),
          description: z.string().max(5000).nullable().optional(),
          projectId: z.string().uuid().nullable().optional(),
          taskId: z.string().uuid().nullable().optional(),
          tagIds: z.array(z.string().uuid()).nullable().optional(),
          timezone: z
            .string()
            .optional()
            .describe('IANA timezone for the formatted times (e.g. Europe/Paris).')
        },
        outputSchema: { data: z.any() }
      },
      async ({
        timeEntryId,
        memberId,
        start,
        end,
        billable,
        description,
        projectId,
        taskId,
        tagIds,
        timezone
      }) => {
        const payload: Record<string, unknown> = {};
        if (memberId !== undefined) payload.member_id = memberId;
        if (start !== undefined) payload.start = toSolidTimeDate(start);
        if (end !== undefined)
          payload.end = end === null ? null : toSolidTimeDate(end);
        if (billable !== undefined) payload.billable = billable;
        if (description !== undefined) payload.description = description;
        if (projectId !== undefined) payload.project_id = projectId;
        if (taskId !== undefined) payload.task_id = taskId;
        if (tagIds !== undefined) payload.tags = tagIds;

        const data = await this.tracker.updateTimeEntry(timeEntryId, payload);
        const enriched = await this.enrichOne(data, timezone);
        return {
          content: [
            {
              type: 'text',
              text: `Entrée mise à jour:\n- ${summarizeEntry(enriched)}`
            }
          ],
          structuredContent: { data: enriched }
        };
      }
    );

    // Tool MCP : supprime définitivement une entrée de temps.
    console.error('[MCP] registering tool:delete_time_entry');
    this.server.registerTool(
      'delete_time_entry',
      {
        title: 'Delete a time entry',
        description: 'Delete a time entry by id. Irreversible.',
        inputSchema: {
          timeEntryId: z.string().uuid()
        },
        outputSchema: { data: z.any() }
      },
      async ({ timeEntryId }) => {
        await this.tracker.deleteTimeEntry(timeEntryId);
        return {
          content: [{ type: 'text', text: `Entrée supprimée: ${timeEntryId}` }],
          structuredContent: { data: { id: timeEntryId, deleted: true } }
        };
      }
    );
    
    console.error('[MCP] registerTimeEntryTools:done');
  }
}