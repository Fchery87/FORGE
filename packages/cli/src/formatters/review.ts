// Review formatter — full implementation in Task 3.13
export function formatReview(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2)
}
