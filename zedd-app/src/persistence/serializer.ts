import { deserialize, serialize } from 'serializr'
import { AppState } from '../AppState'

// The serializer between the app model (MobX) and the persisted plain-data
// shape — the only place the two meet. (De)serialization via serializr;
// legacy key migration happens inside the schemas (see task-schema.ts).

/**
 * The version of the persisted plain-data shape written by `serializeAppState`.
 *
 * - v1 (files from before 2026-10)
 * - v2 (current): slices as objects carrying a stable `id` (uuid), `Task` carries a stable `id`, shape carries `schemaVersion: 2`.
 */
export const SCHEMA_VERSION = 2

/**
 * Strips the `schemaVersion` key (shape metadata, not model data) before
 * deserialization. v1 -> v2 needs no data changes: stable ids and object
 * slices are handled by the lenient deserializers (see task-schema.ts).
 */
export function migrateData(data: unknown): Record<string, unknown> {
  const { schemaVersion, ...rest } = (data ?? {}) as Record<string, unknown>
  return rest
}

/** Serializes the app state into the persisted plain-data shape, stamped with the current `SCHEMA_VERSION`. */
export const serializeAppState = (state: AppState): unknown => {
  const data = serialize(AppState, state) as Record<string, unknown>
  return { ...data, schemaVersion: SCHEMA_VERSION }
}

/** Recreates an AppState from persisted plain data; the undo history does not survive hydration. */
export const hydrateAppState = (data: unknown): AppState => {
  const state = deserialize(AppState, migrateData(data))
  state.undoer.reset()
  return state
}
