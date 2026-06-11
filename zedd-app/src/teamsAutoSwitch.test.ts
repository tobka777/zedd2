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
    assert.strictEqual(
      isTeamsCallOrMeetingTitle('AI Techtalk I - Grundlagen | Microsoft Teams'),
      true,
    )
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

  it('picks the meeting title when a chat and a meeting with hyphens are open', () => {
    assert.strictEqual(
      pickBestTeamsCallOrMeetingTitle([
        'Chat | Doe, John | Microsoft Teams',
        'AI Techtalk I - Grundlagen | Microsoft Teams',
      ]),
      'AI Techtalk I - Grundlagen | Microsoft Teams',
    )
  })

  it('uses the full title (minus Teams suffix) for markerless meetings with hyphens and pipes', () => {
    assert.deepStrictEqual(
      deriveTeamsAutoSwitchTask(
        'test-/&!"=&%!"$afhaus asfv - asufiyx | asfuiyxv | Microsoft Teams',
      ),
      {
        taskName: 'test-/&!"=&%!"$afhaus asfv - asufiyx | asfuiyxv',
        taskActivityName: 'test-/&!"=&%!"$afhaus asfv - asufiyx | asfuiyxv',
        platformTaskComment: 'test-/&!"=&%!"$afhaus asfv - asufiyx | asfuiyxv',
        kind: 'meeting',
      },
    )
  })

  it('returns undefined when no Teams call or meeting title exists', () => {
    assert.strictEqual(
      pickBestTeamsCallOrMeetingTitle([
        'Chat | Alex Example | Microsoft Teams',
        'Calendar | Microsoft Teams',
      ]),
      undefined,
    )
  })
})
