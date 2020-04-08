import { observable } from 'mobx'
import * as assert from 'assert'

import { ObservableGroupMap } from './ObservableGroupMap'

const json = <G>(ogm: ObservableGroupMap<string, G>): { [k: string]: G } =>
  Array.from(ogm.keys()).reduce((r, k) => ((r[k] = ogm.get(k)?.toJS()), r), {} as any)

describe('ObservableGroupMap', () => {
  it('updates groups correctly when an item is removed from the base', () => {
    const base = observable([
      { day: 'mo', hours: 12 },
      { day: 'tu', hours: 2 },
    ])
    const ogm = new ObservableGroupMap(base, (x) => x.day)
    assert.deepEqual(json(ogm), {
      mo: [{ day: 'mo', hours: 12 }],
      tu: [{ day: 'tu', hours: 2 }],
    })
    base[0] = base.pop()!
    assert.deepEqual(json(ogm), {
      tu: [{ day: 'tu', hours: 2 }],
    })
  })
})
