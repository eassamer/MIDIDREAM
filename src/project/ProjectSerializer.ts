import { PART_COUNT, PROJECT_SCHEMA_VERSION, STEPS_PER_BAR, type Project } from './types'

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectParseError'
  }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

/**
 * Parse a project document and check its structural invariants.
 * This is a shape check, not a full schema validator; it guards the
 * invariants the engine relies on (part count, step counts, active pattern).
 */
export function parseProject(json: string): Project {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (err) {
    throw new ProjectParseError(`Invalid JSON: ${(err as Error).message}`)
  }
  if (typeof data !== 'object' || data === null) {
    throw new ProjectParseError('Project must be an object')
  }
  const p = data as Partial<Project>
  if (p.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectParseError(
      `Unsupported schema version ${String(p.schemaVersion)} (expected ${PROJECT_SCHEMA_VERSION})`,
    )
  }
  if (!Array.isArray(p.parts) || p.parts.length !== PART_COUNT) {
    throw new ProjectParseError(`Project must have exactly ${PART_COUNT} parts`)
  }
  if (!Array.isArray(p.patterns) || p.patterns.length === 0) {
    throw new ProjectParseError('Project must have at least one pattern')
  }
  for (const pattern of p.patterns) {
    if (!Array.isArray(pattern.tracks) || pattern.tracks.length !== PART_COUNT) {
      throw new ProjectParseError(`Pattern ${pattern.id} must have ${PART_COUNT} tracks`)
    }
    const expected = pattern.lengthBars * STEPS_PER_BAR
    for (const track of pattern.tracks) {
      if (!Array.isArray(track.steps) || track.steps.length !== expected) {
        throw new ProjectParseError(`Pattern ${pattern.id} has a track with wrong step count`)
      }
    }
  }
  if (!p.patterns.some((pat) => pat.id === p.activePatternId)) {
    throw new ProjectParseError('activePatternId does not match any pattern')
  }
  return p as Project
}
