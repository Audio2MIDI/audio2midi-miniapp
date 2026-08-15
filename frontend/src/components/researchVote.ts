export function withWrongSongTag(tags: string[]): string[] {
  return Array.from(new Set([...tags, 'mismatched_song']))
}

export function isSourceIdentityQuestion(kind?: string): boolean {
  return kind === 'source_identity'
}
