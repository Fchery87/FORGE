import type { StateManager } from './state-manager.js'
import type { ForgeConfig } from '@forge-agent/types'

export type IdPrefix = 'TASK' | 'DEC' | 'REV' | 'QA' | 'SNAP'

type IdCounterKey = keyof ForgeConfig['ids']

const PREFIX_TO_COUNTER: Record<IdPrefix, IdCounterKey> = {
  TASK: 'task_counter',
  DEC:  'decision_counter',
  REV:  'review_counter',
  QA:   'qa_counter',
  SNAP: 'snapshot_counter',
}

function formatId(prefix: IdPrefix, counter: number): string {
  // Pad to 3 digits minimum, expand naturally beyond that
  const suffix = counter.toString().padStart(3, '0')
  return `${prefix}-${suffix}`
}

export class IdGenerator {
  private readonly stateManager: StateManager

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }

  async next(prefix: IdPrefix): Promise<string> {
    const config = await this.stateManager.getConfig()
    const counterKey = PREFIX_TO_COUNTER[prefix]
    const current = config.ids[counterKey]
    const next = current + 1

    // Update only the ids section
    await this.stateManager.updateConfig({
      ids: { ...config.ids, [counterKey]: next },
    })

    return formatId(prefix, next)
  }

  async peek(prefix: IdPrefix): Promise<string> {
    const config = await this.stateManager.getConfig()
    const counterKey = PREFIX_TO_COUNTER[prefix]
    const next = config.ids[counterKey] + 1
    return formatId(prefix, next)
  }
}
