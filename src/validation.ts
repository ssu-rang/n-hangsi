import type { Fields } from './types.js';

export interface PoemForm {
  word: string;
  lines: string[];
}

export interface SignupForm {
  email: string;
  nickname: string;
  password: string;
  passwordConfirm: string;
}

export interface ValidationResult<T> {
  form: T;
  errors: Record<string, string>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lineFieldPattern = /^lines\[(\d+)]$/;

export function validatePoem(body: Fields): ValidationResult<PoemForm> {
  const word = String(body.word ?? '').trim();
  const characters = [...word];
  const lines = extractLines(body);
  const errors: Record<string, string> = {};

  if (/\s/u.test(word)) {
    errors.word = '제시어에는 공백을 넣을 수 없습니다.';
  } else if (characters.length < 2 || characters.length > 6) {
    errors.word = '제시어는 2~6자여야 합니다.';
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

export function validateSignup(body: Fields): ValidationResult<SignupForm> {
  const form = {
    email: String(body.email ?? '').trim().toLowerCase(),
    nickname: String(body.nickname ?? '').trim(),
    password: String(body.password ?? ''),
    passwordConfirm: String(body.passwordConfirm ?? ''),
  };
  const errors: Record<string, string> = {};

  if (!emailPattern.test(form.email)) errors.email = '올바른 이메일을 입력해 주세요.';
  if ([...form.nickname].length < 2 || [...form.nickname].length > 30) errors.nickname = '닉네임은 2~30자여야 합니다.';
  if (form.password.length < 8 || form.password.length > 72) errors.password = '비밀번호는 8~72자여야 합니다.';
  if (form.password !== form.passwordConfirm) errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';

  return { form, errors };
}

function extractLines(body: Fields): string[] {
  return Object.entries(body)
    .map(([key, value]) => ({ index: lineFieldPattern.exec(key)?.[1], value }))
    .filter((entry): entry is { index: string; value: string | undefined } => entry.index !== undefined)
    .sort((left, right) => Number(left.index) - Number(right.index))
    .map(entry => String(entry.value ?? '').trim());
}

