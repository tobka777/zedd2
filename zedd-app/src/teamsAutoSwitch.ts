export type TeamsAutoSwitchTask = {
  taskName: string
  taskActivityName: string
  platformTaskComment: string
  kind: 'call' | 'meeting' | 'fallback'
}

const CALL_MARKER_RE = /\b(call|anruf)\b/i
const MEETING_MARKER_RE = /\b(meeting|besprechung)\b/i
const NON_MEETING_TITLE_RE = /\b(chat|activity|aktivität|calendar|kalender)\b/i
const TEAMS_TOKEN_RE = /^(microsoft\s+)?teams(?:\s+classic)?$/i

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const stripTeamsSuffix = (title: string): string => {
  let result = normalizeWhitespace(title)
  while (true) {
    const next = result.replace(
      /\s*(?:[|:·•\-–—]\s*)?(?:microsoft\s+)?teams(?:\s+classic)?$/i,
      '',
    )
    if (next === result) {
      return result
    }
    result = normalizeWhitespace(next)
  }
}

const splitTitle = (title: string): string[] =>
  stripTeamsSuffix(title)
    .split(/\s*(?:\||:|·|•| - | – | — )\s*/g)
    .map(normalizeWhitespace)
    .filter(Boolean)

const isTeamsToken = (token: string) => TEAMS_TOKEN_RE.test(token)
const isCallToken = (token: string) => /^(call|anruf)$/i.test(token)
const isMeetingToken = (token: string) => /^(meeting|besprechung)$/i.test(token)

const cleanupCallPartner = (token: string) =>
  normalizeWhitespace(
    token
      .replace(/^(call|anruf)\b[: -]*/i, '')
      .replace(/\b(call|anruf)$/i, '')
      .replace(/^(with|mit)\b[: -]*/i, ''),
  )

export const isTeamsCallOrMeetingTitle = (title: string): boolean => {
  const normalizedTitle = stripTeamsSuffix(title)
  const titleTokens = splitTitle(normalizedTitle)
  const hasTeamsSuffix = normalizeWhitespace(title) !== normalizedTitle
  const looksLikeMarkerlessMeeting =
    hasTeamsSuffix &&
    titleTokens.length === 1 &&
    !NON_MEETING_TITLE_RE.test(titleTokens[0]) &&
    !isTeamsToken(titleTokens[0])

  return (
    CALL_MARKER_RE.test(normalizedTitle) ||
    MEETING_MARKER_RE.test(normalizedTitle) ||
    titleTokens.some((token) => isCallToken(token) || isMeetingToken(token)) ||
    looksLikeMarkerlessMeeting
  )
}

export const deriveTeamsAutoSwitchTask = (
  title: string,
  fallbackTaskName = 'teams meeting',
): TeamsAutoSwitchTask => {
  const sanitizedFallback = normalizeWhitespace(fallbackTaskName) || 'teams meeting'
  const titleTokens = splitTitle(title).filter((token) => !isTeamsToken(token))
  const rawTitle = stripTeamsSuffix(title)
  const isCall = CALL_MARKER_RE.test(rawTitle) || titleTokens.some(isCallToken)

  if (isCall) {
    const partner = titleTokens
      .map(cleanupCallPartner)
      .find((token) => token && !isCallToken(token) && !isMeetingToken(token))
    const activityName = partner ? `call with ${partner}` : sanitizedFallback
    return {
      taskName: activityName,
      taskActivityName: activityName,
      platformTaskComment: '',
      kind: partner ? 'call' : 'fallback',
    }
  }

  const meetingName =
    titleTokens.find((token) => token && !isMeetingToken(token)) || normalizeWhitespace(rawTitle)
  const activityName = meetingName || sanitizedFallback

  return {
    taskName: activityName,
    taskActivityName: activityName,
    platformTaskComment: meetingName,
    kind: meetingName ? 'meeting' : 'fallback',
  }
}
