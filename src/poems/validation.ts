import type { Fields } from '../shared/request.js';

export interface PoemForm {
  word: string;
  lines: string[];
}

interface ValidationResult {
  form: PoemForm;
  errors: Record<string, string>;
}

const lineFieldPattern = /^lines\[(\d+)]$/;

export function validatePoem(body: Fields): ValidationResult {
  const word = String(body.word ?? '').trim();
  const characters = [...word];
  const lines = extractLines(body);
  const errors: Record<string, string> = {};

  if (/\s/u.test(word)) {
    errors.word = '제시어에는 공백을 넣을 수 없습니다.';
  } else if (characters.length < 2 || characters.length > 5) {
    errors.word = '제시어는 2~5자여야 합니다.';
  } else if (!characters.every(character => /^[가-힣]$/u.test(character))) {
    errors.word = '제시어는 완성된 한글로 입력해 주세요.';
  }

  if (lines.length !== characters.length) {
    errors.lines = '제시어의 글자 수만큼 문장을 작성해 주세요.';
  }

  lines.forEach((line, index) => {
    if (!line) {
      errors[`line${index}`] = '문장을 입력해 주세요.';
    } else if ([...line].length > 80) {
      errors[`line${index}`] = '문장은 80자 이하여야 합니다.';
    } else if (characters[index] && !line.startsWith(characters[index])) {
      errors[`line${index}`] = `'${characters[index]}'(으)로 시작해야 합니다.`;
    }
  });

  return { form: { word, lines }, errors };
}

function extractLines(body: Fields): string[] {
  return Object.entries(body)
    .map(([key, value]) => ({ index: lineFieldPattern.exec(key)?.[1], value }))
    .filter((entry): entry is { index: string; value: string | undefined } => entry.index !== undefined)
    .sort((left, right) => Number(left.index) - Number(right.index))
    .map(entry => String(entry.value ?? '').trim());
}
