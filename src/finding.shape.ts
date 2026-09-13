/** Одно нарушение GRAIN: файл, строка, правило, что делать. */
export type Finding = {
  file: string
  line: number
  rule: string
  message: string
}

export function makeFinding(place: [string, number], rule: string, message: string): Finding {
  const [file, line] = place
  return { file, line, rule, message }
}
