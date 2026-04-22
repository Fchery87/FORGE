/**
 * Spinner wrapper for long-running operations.
 * Uses ora under the hood. Skipped in --json mode.
 */
import ora from 'ora'
import type { Ora } from 'ora'

let activeSpinner: Ora | null = null

/** Start a spinner with a message. No-op if a spinner is already active. */
export function startSpinner(message: string): void {
  if (activeSpinner) return
  activeSpinner = ora({ text: message, color: 'cyan' }).start()
}

/** Update the spinner text. */
export function updateSpinner(message: string): void {
  if (activeSpinner) activeSpinner.text = message
}

/** Stop the spinner with a success message. */
export function succeedSpinner(message: string): void {
  if (activeSpinner) {
    activeSpinner.succeed(message)
    activeSpinner = null
  }
}

/** Stop the spinner with a failure message. */
export function failSpinner(message: string): void {
  if (activeSpinner) {
    activeSpinner.fail(message)
    activeSpinner = null
  }
}

/** Stop the spinner with a warning message. */
export function warnSpinner(message: string): void {
  if (activeSpinner) {
    activeSpinner.warn(message)
    activeSpinner = null
  }
}

/** Stop the spinner without any final message. */
export function stopSpinner(): void {
  if (activeSpinner) {
    activeSpinner.stop()
    activeSpinner = null
  }
}
