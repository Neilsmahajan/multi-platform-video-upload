import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { DefaultSession } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
declare module "next-auth" {
  interface Session {
    user: {
      refreshToken?: string;
    } & DefaultSession["user"];
  }
}

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  jwt: {},
  callbacks: {
    async jwt({ token, account }) {
      // When signing in, persist the refreshToken if available.
      if (account && account.refresh_token) {
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Optionally expose the refresh token on the session if needed.
      if (session.user) {
        session.user.refreshToken = token.refreshToken as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
