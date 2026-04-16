const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

function normalizeNote(note: string): string {
  const sharps: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }
  return sharps[note] || note
}

function getKeyRootAndMode(key: string): { root: number } {
  const clean = key.replace(/\s/g, '').replace(/m$/, '')
  const rootName = normalizeNote(clean)
  const root = NOTE_TO_SEMITONE[rootName] ?? 0
  return { root }
}

const DIATONIC_INTERVALS = [0, 2, 4, 5, 7, 9, 11]

export function chordToDegree(chord: string, key: string): string {
  if (chord === 'N' || chord === 'X' || !chord) return chord

  const { root: keyRoot } = getKeyRootAndMode(key)

  const match = chord.match(/^([A-G][#b]?)(.*)$/)
  if (!match) return chord

  const [, rootStr, quality] = match
  const normalizedRoot = normalizeNote(rootStr)
  const rootSemitone = NOTE_TO_SEMITONE[normalizedRoot]
  if (rootSemitone === undefined) return chord

  const rootIndex = (rootSemitone - keyRoot + 12) % 12

  let degreeIdx = DIATONIC_INTERVALS.indexOf(rootIndex)
  let alt = ''

  if (degreeIdx === -1) {
    for (let i = 0; i < DIATONIC_INTERVALS.length; i++) {
      const dist = (rootIndex - DIATONIC_INTERVALS[i] + 12) % 12
      if (dist !== 0 && dist < 12) {
        const isLower = rootIndex < DIATONIC_INTERVALS[i]
        degreeIdx = (i + (isLower ? -1 : 1) + DIATONIC_INTERVALS.length) % DIATONIC_INTERVALS.length
        alt = dist <= 3 ? '♭' : dist >= 9 ? '♯' : dist <= 5 ? '♭' : '♯'
        break
      }
    }
  }

  if (degreeIdx === -1) return chord

  const romanNumsUpper = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const romanNumsLower = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']

  const isMinorChord = quality.includes('m') || quality.includes('dim') || quality === 'ø'
  const roman = isMinorChord ? romanNumsLower[degreeIdx] : romanNumsUpper[degreeIdx]

  const qualityPrefix: Record<string, string> = {
    '°': '°', '°7': '°⁷', 'ø': 'ø', 'maj7': ' maj7', '+': '+',
    '7': '⁷', '9': '⁹', '11': '¹¹', '13': '¹³',
    'sus2': ' sus2', 'sus4': ' sus4', 'add9': ' add9',
  }
  const qualitySuffix: Record<string, string> = {
    'm': '', 'm7': '', 'm9': '⁹', 'm11': '¹¹', 'm13': '¹³',
    'dim': '°', 'dim7': '°⁷',
  }

  let suffix = qualitySuffix[quality] || qualityPrefix[quality] || ''
  if (quality === 'm7b5') suffix = 'ø'

  return alt + roman + suffix
}