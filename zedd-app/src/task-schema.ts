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

// TODO(next agent): implement the load-time key migration. serializr 3.0.5 has NO
// `transform`/`createTransformer` export (the plan's snippet was wrong). Build the schema
// as a manual ModelSchema ({ factory, deserialize, serialize }):
//   - deserialize: for each [old, new] in OLD_TO_NEW, if the JSON value has `old` and
//     lacks `new`, copy `old` -> `new` (idempotent; leave already-canonical data alone),
//     then hand off to the inner object(Task) deserializer;
//   - serialize: pass through (the class only ever holds the canonical keys).
// For now this is the plain pre-migration schema so the build stays green and behavior
// is byte-identical to before the rename. KNOWN GAP: old `data/` files carrying
// `platformTaskIntId`/`platformType` will not populate `intId`/`typ` until this is wired.
export const taskSchema = object(Task)
