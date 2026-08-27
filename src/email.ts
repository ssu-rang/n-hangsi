import nodemailer from 'nodemailer';
import type { EmailSender } from './types.js';

export function createEmailSenderFromEnvironment(): EmailSender {
  return {
    async sendVerification(email, verificationUrl) {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT || 587);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      const from = process.env.SMTP_FROM;
      if (!host || !user || !pass || !from || !Number.isInteger(port)) {
        throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM are required');
      }

      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      await transport.sendMail({
        from,
        to: email,
        subject: '[N행시] 이메일 주소를 인증해 주세요',
        text: `아래 링크를 열어 이메일 인증을 완료해 주세요.\n\n${verificationUrl}\n\n이 링크는 30분 동안 유효합니다.`,
        html: `<p>N행시 회원가입을 완료하려면 아래 버튼을 눌러 주세요.</p><p><a href="${escapeHtml(verificationUrl)}">이메일 인증하기</a></p><p>이 링크는 30분 동안 유효합니다.</p>`,
      });
    },
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
