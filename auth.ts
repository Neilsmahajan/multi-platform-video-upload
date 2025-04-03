import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import TikTok from "next-auth/providers/tiktok";
import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/youtubepartner",
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
    TikTok({
      clientId: process.env.AUTH_TIKTOK_ID!,
      clientSecret: process.env.AUTH_TIKTOK_SECRET!,
      authorization: {
        params: {
          // scope: "user.info.basic user.info.profile video.upload",
          scope: "user.info.basic",
          response_type: "code",
          client_key: process.env.AUTH_TIKTOK_ID!,
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
      if (account) {
        token.accessToken = account.access_token;
        if (account.refresh_token) {
          token.refreshToken = account.refresh_token;
        }
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
});
