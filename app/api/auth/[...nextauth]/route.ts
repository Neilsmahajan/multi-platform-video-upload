import { DefaultSession } from "next-auth";
import { handlers } from "@/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      refreshToken?: string;
      accessToken?: string;
      provider?: string;
    } & DefaultSession["user"];
  }

  interface JWT {
    userId?: string;
    provider?: string;
    providerAccountId?: string;
  }
}

export const { GET, POST } = handlers;
