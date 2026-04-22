import { isAbsolute, relative, resolve } from 'node:path'

function isWithinRoot(rootDir: string, candidatePath: string): boolean {
  const rel = relative(rootDir, candidatePath)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function resolveSearchPathsWithinProject(
  projectDir: string,
  searchPaths: string[],
): string[] {
  return searchPaths.map((searchPath) => {
    const trimmed = searchPath.trim()
    if (!trimmed) {
      throw new Error('Invalid skills.search_paths entry: path must not be empty')
    }
    if (isAbsolute(trimmed)) {
      throw new Error(`Invalid skills.search_paths entry "${searchPath}": absolute paths are not allowed`)
    }

    const resolvedPath = resolve(projectDir, trimmed)
    if (!isWithinRoot(projectDir, resolvedPath)) {
      throw new Error(`Invalid skills.search_paths entry "${searchPath}": search path must stay within the project root`)
    }

    return resolvedPath
  })
}
