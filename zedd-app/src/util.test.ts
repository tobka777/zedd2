import * as assert from 'assert'
import { parseISO } from 'date-fns'
import { splitIntervalIntoCalendarDays } from './util'

describe('splitIntervalIntoCalendarDays', () => {
  it('works', () => {
    assert.deepStrictEqual(
      splitIntervalIntoCalendarDays({
        start: parseISO('2019-10-20T11:35'),
        end: parseISO('2019-10-22T10:00'),
      }),
      [
        {
          start: parseISO('2019-10-20T11:35'),
          end: parseISO('2019-10-21T00:00'),
        },
        {
          start: parseISO('2019-10-21T00:00'),
          end: parseISO('2019-10-22T00:00'),
        },
        {
          start: parseISO('2019-10-22T00:00'),
          end: parseISO('2019-10-22T10:00'),
        },
      ],
    )
  })
})
