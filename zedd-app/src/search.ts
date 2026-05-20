export type SearchableOption<T> = {
  item: T
  text: string
}

const WORD_SEPARATOR_REGEX = /[^\p{L}\p{N}]+/gu

const splitWords = (input: string): string[] =>
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
  const queryWords = splitWords(query)
  if (queryWords.length === 0) {
    return options.slice(0, maxEntries).map((x) => x.item)
  }

  const scored: Array<{ item: T; tokenExcess: number; textLength: number; text: string }> = []
  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    const optionWords = splitWords(option.text)
    if (optionWords.length === 0) continue

    let tokenExcess = 0
    let fullyMatched = true
    for (let q = 0; q < queryWords.length; q++) {
      const queryWord = queryWords[q]
      let bestMatchLength = Number.POSITIVE_INFINITY
      for (let ow = 0; ow < optionWords.length; ow++) {
        const optionWord = optionWords[ow]
        if (optionWord.startsWith(queryWord)) {
          if (optionWord.length < bestMatchLength) {
            bestMatchLength = optionWord.length
          }
        }
      }
      if (bestMatchLength === Number.POSITIVE_INFINITY) {
        fullyMatched = false
        break
      }
      tokenExcess += bestMatchLength - queryWord.length
    }

    if (fullyMatched) {
      scored.push({
        item: option.item,
        tokenExcess,
        textLength: option.text.length,
        text: option.text,
      })
    }
  }

  scored.sort((a, b) => {
    if (a.tokenExcess !== b.tokenExcess) return a.tokenExcess - b.tokenExcess
    if (a.textLength !== b.textLength) return a.textLength - b.textLength
    return a.text.localeCompare(b.text)
  })

  return scored.slice(0, maxEntries).map((x) => x.item)
}
