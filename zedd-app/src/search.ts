export type SearchableOption<T> = {
  item: T
  text: string
  words?: string[]
}

const WORD_SEPARATOR_REGEX = /[^\p{L}\p{N}]+/gu

export const tokenizeSearchWords = (input: string): string[] =>
  input
    .toLowerCase()
    .trim()
    .split(WORD_SEPARATOR_REGEX)
    .filter(Boolean)

export const rankByWordPrefixSimilarity = <T>(
  options: SearchableOption<T>[],
  query: string,
  maxEntries: number,
): T[] => {
  const queryWords = tokenizeSearchWords(query)
  if (queryWords.length === 0) {
    return options.slice(0, maxEntries).map((x) => x.item)
  }

  const isBetter = (
    a: { tokenExcess: number; textLength: number; text: string },
    b: { tokenExcess: number; textLength: number; text: string },
  ): boolean =>
    a.tokenExcess < b.tokenExcess ||
    (a.tokenExcess === b.tokenExcess &&
      (a.textLength < b.textLength ||
        (a.textLength === b.textLength && a.text.localeCompare(b.text) < 0)))

  const insertSorted = (
    top: Array<{ item: T; tokenExcess: number; textLength: number; text: string }>,
    candidate: { item: T; tokenExcess: number; textLength: number; text: string },
  ) => {
    let insertAt = top.length
    for (let i = 0; i < top.length; i++) {
      if (isBetter(candidate, top[i])) {
        insertAt = i
        break
      }
    }
    top.splice(insertAt, 0, candidate)
    if (top.length > maxEntries) {
      top.pop()
    }
  }

  const top: Array<{ item: T; tokenExcess: number; textLength: number; text: string }> = []
  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    const optionWords = option.words ?? tokenizeSearchWords(option.text)
    if (optionWords.length === 0) continue

    let tokenExcess = 0
    let fullyMatched = true
    for (let q = 0; q < queryWords.length; q++) {
      const queryWord = queryWords[q]
      let shortestMatchLength = Number.POSITIVE_INFINITY
      for (let ow = 0; ow < optionWords.length; ow++) {
        const optionWord = optionWords[ow]
        if (optionWord.startsWith(queryWord)) {
          if (optionWord.length < shortestMatchLength) {
            shortestMatchLength = optionWord.length
          }
        }
      }
      if (shortestMatchLength === Number.POSITIVE_INFINITY) {
        fullyMatched = false
        break
      }
      tokenExcess += shortestMatchLength - queryWord.length
    }

    if (fullyMatched) {
      const scored = {
        item: option.item,
        tokenExcess,
        textLength: option.text.length,
        text: option.text,
      }
      if (top.length < maxEntries || isBetter(scored, top[top.length - 1])) {
        insertSorted(top, scored)
      }
    }
  }

  return top.map((x) => x.item)
}
