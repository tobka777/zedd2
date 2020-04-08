import * as assert from 'assert'
import { smartRound } from './ClarityView'

describe.only('smartRound', () => {
  it('works for [2.1, 2.1] nearestTo=0.25', () => {
    const smartRounded = smartRound(
      [
        [2.1, 'A'],
        [2.1, 'B'],
      ] as [number, string][],
      ([x]) => x,
      0.25,
    )
    assert.deepEqual(smartRounded, [
      [2.25, [2.1, 'A']],
      [2.0, [2.1, 'B']],
    ])
  })
  it('rounds one value up when enough values are slightly above rounded', () => {
    const smartRounded = smartRound(
      [
        [2.01, 'A'],
        [2.02, 'B'],
        [2.03, 'C'],
        [2.04, 'D'],
        [2.05, 'E'],
      ] as [number, string][],
      ([x]) => x,
      0.25,
    )
    assert.deepEqual(smartRounded, [
      [2.25, [2.05, 'E']],
      [2, [2.04, 'D']],
      [2, [2.03, 'C']],
      [2, [2.02, 'B']],
      [2, [2.01, 'A']],
    ])
  })
  it('should work with nearestTo=1/3', () => {
    const smartRounded = smartRound(
      [
        [1 / 3 + 0.01, 'A'],
        [1 / 3, 'B'],
        [1 / 3, 'C'],
      ] as [number, string][],
      ([x]) => x,
      1 / 3,
    )
    assert.deepEqual(smartRounded, [
      [1 / 3, [1 / 3 + 0.01, 'A']],
      [1 / 3, [1 / 3, 'B']],
      [1 / 3, [1 / 3, 'C']],
    ])
  })
})
