const surnames = ['赵', '钱', '孙', '李', '周', '吴', '郑', '王']
const givenNames = ['安', '宁', '明远', '雨桐', '思源', '嘉禾', '子墨', '清扬']
const demoSentences = [
  '这个观点很有启发。',
  '原来中间还有这样的传导关系。',
  '先看条件，再判断结果。',
  '我想再回看一下刚才的片段。'
]

export function demoInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function demoChineseName(): string {
  return `${surnames[demoInteger(0, surnames.length - 1)]}${givenNames[demoInteger(0, givenNames.length - 1)]}`
}

export function demoSentence(): string {
  return demoSentences[demoInteger(0, demoSentences.length - 1)]
}

export function demoParagraph(sentenceCount = 3): string {
  return Array.from({ length: sentenceCount }, () => demoSentence()).join('')
}

export function demoMonthDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}-${day}`
}
