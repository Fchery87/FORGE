import type { TaskStatus } from '@forge-core/types'

// Role definitions
export type ForgeRole = 'builder' | 'manager' | 'executive'

// Command names
export type ForgeCommand =
  | 'init'
  | 'install'
  | 'doctor'
  | 'intake'
  | 'plan'
  | 'execute'
  | 'merge'
  | 'review'
  | 'qa'
  | 'ship'
  | 'status'
  | 'snapshot'
  | 'restore'
  | 'config'

// Role assigned to each command
export const COMMAND_ROLES: Record<ForgeCommand, ForgeRole> = {
  init:     'manager',
  install:  'manager',
  doctor:   'manager',
  intake:   'manager',
  plan:     'manager',
  execute:  'builder',
  merge:    'manager',
  review:   'executive',
  qa:       'executive',
  ship:     'executive',
  status:   'manager',
  snapshot: 'manager',
  restore:  'manager',
  config:   'manager',
}

// What operations are allowed per role
export interface RolePermissions {
  canReadState: boolean
  canWriteStateFiles: boolean
  canWriteSourceFiles: boolean
  canCreateTasks: boolean
  canTransitionTasks: boolean
  canApproveReviews: boolean
  canSpawnWorkers: boolean
  canRunVerifiers: boolean
}

export const ROLE_PERMISSIONS: Record<ForgeRole, RolePermissions> = {
  builder: {
    canReadState: true,        // scoped read only
    canWriteStateFiles: false,
    canWriteSourceFiles: true,
    canCreateTasks: false,
    canTransitionTasks: true,  // limited: only in_progress → in_review, blocked
    canApproveReviews: false,
    canSpawnWorkers: false,
    canRunVerifiers: false,
  },
  manager: {
    canReadState: true,
    canWriteStateFiles: true,
    canWriteSourceFiles: false,
    canCreateTasks: true,
    canTransitionTasks: true,
    canApproveReviews: false,
    canSpawnWorkers: true,
    canRunVerifiers: false,
  },
  executive: {
    canReadState: true,
    canWriteStateFiles: false,
    canWriteSourceFiles: false,
    canCreateTasks: false,
    canTransitionTasks: true,  // limited: approve/reject transitions
    canApproveReviews: true,
    canSpawnWorkers: false,
    canRunVerifiers: true,
  },
}

// Preconditions for commands — what project status is required
export const COMMAND_PRECONDITIONS: Partial<Record<ForgeCommand, string[]>> = {
  plan:    ['intake'],           // must have done intake first
  execute: ['planning', 'executing'],  // must have a plan
  merge:   ['executing'],
  review:  ['planning', 'executing', 'reviewing'],
  qa:      ['reviewing'],
  ship:    ['reviewing'],
}

export interface PermissionCheckResult {
  allowed: boolean
  role: ForgeRole
  reasons: string[]
}

export interface PreconditionCheckResult {
  met: boolean
  command: ForgeCommand
  required_statuses: string[]
  current_status: string
  reason: string | null
}

export interface ForgeError {
  code: string
  message: string
  command?: ForgeCommand
  details?: unknown
}

export class Orchestrator {
  /**
   * Get the role for a command.
   */
  getRoleForCommand(command: ForgeCommand): ForgeRole {
    return COMMAND_ROLES[command]
  }

  /**
   * Get permissions for a role.
   */
  getPermissions(role: ForgeRole): RolePermissions {
    return ROLE_PERMISSIONS[role]
  }

  /**
   * Check if a command is permitted.
   * For now, all commands are always permitted by role — the permission matrix
   * is enforced at the operation level, not command level. This method is a
   * hook for future fine-grained control.
   */
  checkCommandPermission(command: ForgeCommand): PermissionCheckResult {
    const role = this.getRoleForCommand(command)
    return {
      allowed: true,
      role,
      reasons: [],
    }
  }

  /**
   * Check if a command's preconditions are met given the current project status.
   */
  checkPreconditions(command: ForgeCommand, currentStatus: string): PreconditionCheckResult {
    const required = COMMAND_PRECONDITIONS[command]
    if (!required || required.length === 0) {
      return {
        met: true,
        command,
        required_statuses: [],
        current_status: currentStatus,
        reason: null,
      }
    }

    const met = required.includes(currentStatus)
    return {
      met,
      command,
      required_statuses: required,
      current_status: currentStatus,
      reason: met
        ? null
        : `Command '${command}' requires project status to be one of [${required.join(', ')}] but current status is '${currentStatus}'`,
    }
  }

  /**
   * Validate a task status transition is structurally allowed for a role.
   * Builder can only transition: ready→in_progress, in_progress→in_review, in_progress→blocked, blocked→in_progress
   * Manager can do any transition.
   * Executive can do: in_review→qa_pending, in_review→rejected, qa_pending→done
   */
  checkTransitionPermission(
    role: ForgeRole,
    currentStatus: TaskStatus,
    newStatus: TaskStatus,
  ): PermissionCheckResult {
    const BUILDER_ALLOWED: Array<[TaskStatus, TaskStatus]> = [
      ['ready', 'in_progress'],
      ['in_progress', 'in_review'],
      ['in_progress', 'blocked'],
      ['blocked', 'in_progress'],
    ]

    const EXECUTIVE_ALLOWED: Array<[TaskStatus, TaskStatus]> = [
      ['in_review', 'qa_pending'],
      ['in_review', 'rejected'],
      ['qa_pending', 'done'],
      ['qa_pending', 'in_progress'],
    ]

    if (role === 'manager') {
      return { allowed: true, role, reasons: [] }
    }

    const allowed_pairs = role === 'builder' ? BUILDER_ALLOWED : EXECUTIVE_ALLOWED
    const isAllowed = allowed_pairs.some(
      ([from, to]) => from === currentStatus && to === newStatus
    )

    return {
      allowed: isAllowed,
      role,
      reasons: isAllowed
        ? []
        : [`Role '${role}' cannot transition task from '${currentStatus}' to '${newStatus}'`],
    }
  }

  /**
   * Wrap an error into a ForgeError.
   */
  wrapError(error: unknown, command?: ForgeCommand): ForgeError {
    if (error instanceof Error) {
      return {
        code: error.constructor.name,
        message: error.message,
        command,
        details: error,
      }
    }
    return {
      code: 'UnknownError',
      message: String(error),
      command,
    }
  }
}
