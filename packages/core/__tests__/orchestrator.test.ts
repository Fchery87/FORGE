import { describe, it, expect } from 'vitest'
import { Orchestrator, COMMAND_ROLES, ROLE_PERMISSIONS, COMMAND_PRECONDITIONS } from '../src/index.js'

const orch = new Orchestrator()

describe('Orchestrator.getRoleForCommand', () => {
  it('execute maps to builder', () => {
    expect(orch.getRoleForCommand('execute')).toBe('builder')
  })

  it('merge maps to manager', () => {
    expect(orch.getRoleForCommand('merge')).toBe('manager')
  })

  it('review maps to executive', () => {
    expect(orch.getRoleForCommand('review')).toBe('executive')
  })

  it('qa maps to executive', () => {
    expect(orch.getRoleForCommand('qa')).toBe('executive')
  })

  it('ship maps to executive', () => {
    expect(orch.getRoleForCommand('ship')).toBe('executive')
  })

  it('init maps to manager', () => {
    expect(orch.getRoleForCommand('init')).toBe('manager')
  })
})

describe('ROLE_PERMISSIONS', () => {
  it('builder can write source files', () => {
    expect(ROLE_PERMISSIONS.builder.canWriteSourceFiles).toBe(true)
  })

  it('builder cannot write state files', () => {
    expect(ROLE_PERMISSIONS.builder.canWriteStateFiles).toBe(false)
  })

  it('manager can write state files', () => {
    expect(ROLE_PERMISSIONS.manager.canWriteStateFiles).toBe(true)
  })

  it('manager cannot write source files', () => {
    expect(ROLE_PERMISSIONS.manager.canWriteSourceFiles).toBe(false)
  })

  it('executive can approve reviews', () => {
    expect(ROLE_PERMISSIONS.executive.canApproveReviews).toBe(true)
  })

  it('executive can run verifiers', () => {
    expect(ROLE_PERMISSIONS.executive.canRunVerifiers).toBe(true)
  })
})

describe('Orchestrator.checkPreconditions', () => {
  it('init has no preconditions', () => {
    const result = orch.checkPreconditions('init', 'intake')
    expect(result.met).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('plan requires intake status', () => {
    const ok = orch.checkPreconditions('plan', 'intake')
    expect(ok.met).toBe(true)
  })

  it('plan fails when status is shipped', () => {
    const fail = orch.checkPreconditions('plan', 'shipped')
    expect(fail.met).toBe(false)
    expect(fail.reason).toContain('intake')
  })

  it('execute requires planning or executing status', () => {
    expect(orch.checkPreconditions('execute', 'planning').met).toBe(true)
    expect(orch.checkPreconditions('execute', 'executing').met).toBe(true)
    expect(orch.checkPreconditions('execute', 'intake').met).toBe(false)
  })

  it('status has no preconditions', () => {
    const result = orch.checkPreconditions('status', 'intake')
    expect(result.met).toBe(true)
  })
})

describe('Orchestrator.checkTransitionPermission', () => {
  it('manager can do any transition', () => {
    expect(orch.checkTransitionPermission('manager', 'draft', 'planned').allowed).toBe(true)
    expect(orch.checkTransitionPermission('manager', 'done', 'in_progress').allowed).toBe(true) // even invalid SM ones
  })

  it('builder can start a task (ready → in_progress)', () => {
    expect(orch.checkTransitionPermission('builder', 'ready', 'in_progress').allowed).toBe(true)
  })

  it('builder can submit for review (in_progress → in_review)', () => {
    expect(orch.checkTransitionPermission('builder', 'in_progress', 'in_review').allowed).toBe(true)
  })

  it('builder cannot approve task (in_review → qa_pending)', () => {
    expect(orch.checkTransitionPermission('builder', 'in_review', 'qa_pending').allowed).toBe(false)
  })

  it('executive can approve for QA (in_review → qa_pending)', () => {
    expect(orch.checkTransitionPermission('executive', 'in_review', 'qa_pending').allowed).toBe(true)
  })

  it('executive cannot create tasks (precondition check, not transition)', () => {
    expect(ROLE_PERMISSIONS.executive.canCreateTasks).toBe(false)
  })
})

describe('Orchestrator.wrapError', () => {
  it('wraps Error instance', () => {
    const err = new Error('something failed')
    const wrapped = orch.wrapError(err, 'execute')
    expect(wrapped.message).toBe('something failed')
    expect(wrapped.command).toBe('execute')
    expect(wrapped.code).toBe('Error')
  })

  it('wraps unknown error', () => {
    const wrapped = orch.wrapError('string error')
    expect(wrapped.code).toBe('UnknownError')
    expect(wrapped.message).toBe('string error')
  })
})
