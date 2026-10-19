import { object } from 'serializr'
import { Task } from './entities/Task'

/**
 * Legacy on-disk keys -> unified canonical keys. Persisted app state under `data/` was
 * written with the pre-unification field names; the load-time migration maps them onto
 * the new keys (deserialize only) and never rewrites the file.
 */
export const OLD_TO_NEW: Record<string, string> = {
  platformTaskIntId: 'intId',
  platformType: 'typ',
}

/**
 * Returns the task JSON with legacy keys promoted to their canonical names.
*/
export function migrateLegacyTaskKeys(json: any): any {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return json
  }
  let changed = false
  const out: Record<string, unknown> = { ...json }
  for (const [legacy, canonical] of Object.entries(OLD_TO_NEW)) {
    if (json[legacy] !== undefined && json[canonical] === undefined) {
      out[canonical] = json[legacy]
      changed = true
    }
  }
  return changed ? out : json
}

/**
 * Model schema for {@link Task} that migrates legacy on-disk field names onto the unified
 * canonical ones at deserialization time.*/
export const taskSchema = object(Task, {
  beforeDeserialize: (callback, jsonValue) => {
    callback(null, migrateLegacyTaskKeys(jsonValue))
  },
})
