/**
 * Forge CLI formatting primitives.
 *
 * All functions are terminal-only. Commands using --json should
 * skip these and write raw JSON to stdout instead.
 */
import kleur from 'kleur'

// ── Box-drawing characters ──────────────────────────────────────────

const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  arrow: '◆',
  bullet: '•',
  check: '✓',
  cross: '✗',
  dot: '◯',
  dash: '╌',
} as const

// ── Branding ────────────────────────────────────────────────────────

/** Print a branded command header. */
export function header(title: string): void {
  const label = ` Forge ${title} `
  const line = BOX.h.repeat(label.length)
  process.stdout.write('\n')
  process.stdout.write(kleur.bold(kleur.cyan(`${BOX.tl}${line}${BOX.tr}`)) + '\n')
  process.stdout.write(kleur.bold(kleur.cyan(`${BOX.v}`)) + kleur.bold(kleur.white(label)) + kleur.bold(kleur.cyan(`${BOX.v}`)) + '\n')
  process.stdout.write(kleur.bold(kleur.cyan(`${BOX.bl}${line}${BOX.br}`)) + '\n')
  process.stdout.write('\n')
}

/** Print a thin section separator with a label. */
export function section(title: string): void {
  const dim = kleur.dim
  process.stdout.write(dim(`  ${BOX.h.repeat(2)} `) + kleur.bold(title) + '\n')
}

/** Print a branded footer line. */
export function footer(): void {
  process.stdout.write('\n')
}

// ── Box panel ───────────────────────────────────────────────────────

interface BoxOptions {
  title?: string
  width?: number
  borderColor?: (s: string) => string
}

/**
 * Render a multi-line panel with optional title.
 *
 * Usage:
 *   panel(['Task: TASK-001', 'Status: done'], { title: 'Result' })
 */
export function panel(lines: string[], opts: BoxOptions = {}): void {
  const color = opts.borderColor ?? kleur.dim
  const width = opts.width ?? Math.max(...lines.map(l => stripAnsi(l).length), 20) + 4
  const titleLen = opts.title ? stripAnsi(opts.title).length + 2 : 0
  const innerWidth = Math.max(width, titleLen + 4)

  const topTitle = opts.title
    ? `${color(BOX.tl + BOX.h)} ${kleur.bold(opts.title)} ${color(BOX.h.repeat(innerWidth - titleLen - 3) + BOX.tr)}`
    : `${color(BOX.tl + BOX.h.repeat(innerWidth) + BOX.tr)}`

  process.stdout.write(topTitle + '\n')
  for (const line of lines) {
    const pad = innerWidth - stripAnsi(line).length - 2
    process.stdout.write(`${color(BOX.v)} ${line}${' '.repeat(Math.max(0, pad))} ${color(BOX.v)}` + '\n')
  }
  process.stdout.write(`${color(BOX.bl + BOX.h.repeat(innerWidth) + BOX.br)}` + '\n')
}

// ── Key-value row ───────────────────────────────────────────────────

/** Render a labeled key-value pair with aligned values. */
export function kv(label: string, value: string, labelWidth = 14): void {
  const padded = label.padEnd(labelWidth)
  process.stdout.write(`  ${kleur.dim(padded)} ${value}\n`)
}

// ── Status badges ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, (s: string) => string> = {
  done: kleur.green,
  shipped: kleur.green,
  approved: kleur.green,
  pass: kleur.green,
  in_progress: kleur.blue,
  executing: kleur.blue,
  planning: kleur.blue,
  active: kleur.blue,
  in_review: kleur.yellow,
  reviewing: kleur.yellow,
  qa_pending: kleur.magenta,
  blocked: kleur.red,
  rejected: kleur.red,
  fail: kleur.red,
  draft: kleur.gray,
  pending: kleur.gray,
  intake: kleur.gray,
}

/** Render a colored status badge. */
export function badge(status: string): string {
  const color = STATUS_COLORS[status] ?? kleur.white
  return color(status)
}

// ── Checklist ───────────────────────────────────────────────────────

/** Render a checklist item with pass/fail icon. */
export function checkItem(text: string, passed: boolean): void {
  const icon = passed ? kleur.green(BOX.check) : kleur.red(BOX.cross)
  process.stdout.write(`  ${icon}  ${text}\n`)
}

// ── Context budget gauge ───────────────────────────────────────────

/** Render a visual progress gauge. */
export function gauge(label: string, current: number, max: number, width = 20): string {
  const pct = max > 0 ? Math.min(current / max, 1) : 0
  const filled = Math.round(pct * width)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const pctStr = `${Math.round(pct * 100)}%`

  let barColor: (s: string) => string
  if (pct < 0.6) barColor = kleur.green
  else if (pct < 0.8) barColor = kleur.yellow
  else barColor = kleur.red

  return `${kleur.dim(label.padEnd(10))} ${barColor(bar)} ${kleur.bold(pctStr)}`
}

// ── Task card ───────────────────────────────────────────────────────

/** Render a compact task summary. */
export function taskCard(task: { task_id: string; title: string; status: string; phase: string }): void {
  const id = kleur.bold(task.task_id)
  const title = task.title
  const status = badge(task.status)
  process.stdout.write(`  ${id}  ${kleur.dim('─')}  ${title}  ${kleur.dim('[')}${status}${kleur.dim(']')}\n`)
}

// ── Next-step hint ──────────────────────────────────────────────────

/** Print a dimmed next-step hint. */
export function hint(text: string): void {
  process.stdout.write('\n')
  process.stdout.write(kleur.dim(`  ${BOX.arrow} ${text}`) + '\n')
}

// ── Success / error / warning banners ──────────────────────────────

export function successBanner(message: string): void {
  process.stdout.write('\n')
  process.stdout.write(`  ${kleur.green(BOX.check)}  ${kleur.bold(message)}` + '\n')
}

export function errorBanner(message: string): void {
  process.stdout.write('\n')
  process.stdout.write(`  ${kleur.red(BOX.cross)}  ${kleur.bold(message)}` + '\n')
}

export function warnBanner(message: string): void {
  process.stdout.write(`  ${kleur.yellow('⚠')}  ${kleur.yellow(message)}` + '\n')
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip ANSI escape codes to measure visible string length. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}
