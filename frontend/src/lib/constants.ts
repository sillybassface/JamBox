export const STEM_COLORS: Record<string, string> = {
  vocals: '#db90ff',
  drums:  '#00e3fd',
  bass:   '#ddffb0',
  guitar: '#ffb347',
  other:  '#f9a8d4',
}

export function getStemColor(name: string): string {
  return STEM_COLORS[name.toLowerCase()] ?? '#db90ff'
}