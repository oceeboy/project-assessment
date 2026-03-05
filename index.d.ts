declare namespace Express {
  interface User {
    id: string;
    email: string;
    role: 'user' | 'admin';
  }
}

declare interface UserPayload {
  id: string;
  email: string;
  role: 'user' | 'admin';
}
