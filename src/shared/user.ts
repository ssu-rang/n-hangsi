export interface User {
  id: number;
  username: string;
  nickname: string;
  bio: string;
  provider: string;
  provider_user_id: string | null;
}
