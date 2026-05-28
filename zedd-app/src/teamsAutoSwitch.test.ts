import * as assert from 'assert'

import {
  deriveTeamsAutoSwitchTask,
  isTeamsCallOrMeetingTitle,
  pickBestTeamsCallOrMeetingTitle,
} from './teamsAutoSwitch'

describe('teamsAutoSwitch', () => {
  it('derives a call task from a Teams call title', () => {
    assert.deepStrictEqual(
      deriveTeamsAutoSwitchTask('Call | Robert | Microsoft Teams'),
      {
        taskName: 'call with Robert',
        taskActivityName: 'call with Robert',
        platformTaskComment: '',
        kind: 'call',
      },
    )
  })

  it('derives a meeting task and comment from a Teams meeting title', () => {
    assert.deepStrictEqual(
      deriveTeamsAutoSwitchTask('Architecture Sync | Meeting | Microsoft Teams'),
      {
        taskName: 'Architecture Sync',
        taskActivityName: 'Architecture Sync',
        platformTaskComment: 'Architecture Sync',
        kind: 'meeting',
      },
    )
  })

  it('recognizes call and meeting titles', () => {
    assert.strictEqual(isTeamsCallOrMeetingTitle('Call | Robert | Microsoft Teams'), true)
    assert.strictEqual(
      isTeamsCallOrMeetingTitle('Architecture Sync | Besprechung | Microsoft Teams'),
      true,
    )
    assert.strictEqual(isTeamsCallOrMeetingTitle('Entwicklungs-Daily | Microsoft Teams'), true)
    assert.strictEqual(isTeamsCallOrMeetingTitle('Chat | Robert | Microsoft Teams'), false)
  })

  it('prefers explicit meeting windows when several Teams windows are open', () => {
    assert.strictEqual(
      pickBestTeamsCallOrMeetingTitle([
        'Alex Example | Microsoft Teams',
        'Architecture Sync | Meeting | Microsoft Teams',
      ]),
      'Architecture Sync | Meeting | Microsoft Teams',
    )
  })

  it('returns null when no Teams call or meeting title exists', () => {
    assert.strictEqual(
      pickBestTeamsCallOrMeetingTitle([
        'Chat | Alex Example | Microsoft Teams',
        'Calendar | Microsoft Teams',
      ]),
      null,
    )
  })
})
