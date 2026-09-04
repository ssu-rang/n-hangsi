export type User = {
  id: number;
  username: string;
  nickname: string;
  provider: string;
  provider_user_id: string | null;
};
