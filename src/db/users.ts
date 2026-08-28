import type { DatabaseSync } from 'node:sqlite';
import type { User } from '../shared/user.js';

interface NewUser {
  username: string;
  nickname: string;
  provider?: string;
  providerUserId?: string | null;
}

export interface ProfileStats {
  averageRating: number | null;
  ratingCount: number;
}

export function findUserById(db: DatabaseSync, id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as User | undefined;
}

export function findProviderUser(
  db: DatabaseSync,
  provider: string,
  providerUserId: string,
): User | undefined {
  return db
    .prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?')
    .get(provider, providerUserId) as unknown as User | undefined;
}

export function findOrLinkGoogleUser(
  db: DatabaseSync,
  providerUserId: string,
  email: string,
): User | undefined {
  const user = findProviderUser(db, 'google', providerUserId);
  if (user) return user;

  const legacyUser = db.prepare(`
    SELECT * FROM users
    WHERE lower(username) = ?
      AND password IS NULL
      AND (provider_user_id IS NULL OR trim(provider_user_id) = '')
    LIMIT 1
  `).get(email.trim().toLowerCase()) as unknown as User | undefined;
  if (!legacyUser) return undefined;

  db.prepare(`
    UPDATE users
    SET provider = 'google', provider_user_id = ?
    WHERE id = ?
  `).run(providerUserId, legacyUser.id);
  return findUserById(db, legacyUser.id);
}

export function createUser(db: DatabaseSync, input: NewUser): User {
  const { username, nickname, provider = 'local', providerUserId = null } = input;
  const result = db.prepare(`
    INSERT INTO users(username, nickname, password, provider, provider_user_id)
    VALUES (?, ?, NULL, ?, ?)
  `).run(username.toLowerCase(), nickname, provider, providerUserId);

  return findUserById(db, Number(result.lastInsertRowid))!;
}

export function getProfileStats(db: DatabaseSync, userId: number): ProfileStats {
  const row = db.prepare(`
    SELECT AVG(r.score) average_rating, COUNT(r.id) rating_count
    FROM ratings r JOIN poems p ON p.id = r.poem_id
    WHERE p.author_id = ?
  `).get(userId) as unknown as { average_rating: number | null; rating_count: number };
  return { averageRating: row.average_rating, ratingCount: row.rating_count };
}

export function deleteUserAccount(db: DatabaseSync, userId: number): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE poems
      SET author_id = NULL, author_name = '익명'
      WHERE author_id = ?
    `).run(userId);
    db.prepare(`
      UPDATE reports
      SET poem_author_id = NULL, poem_author_name = '익명'
      WHERE poem_author_id = ?
    `).run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
