import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import TikTok from "next-auth/providers/tiktok";
import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
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
          scope: "user.info.basic,video.upload",
        },
      },
    }),
  ],
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // Handle JWT callback
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        if (account.refresh_token) {
          token.refreshToken = account.refresh_token;
        }
      }
      return token;
    },
    // Handle session callback
    async session({ session, token }) {
      if (session.user) {
        session.user.refreshToken = token.refreshToken as string;
      }
      return session;
    },
  },
  debug: true,
  logger: {
    error(error) {
      console.error("AUTH ERROR:", error);
    },
    warn(message) {
      console.warn("AUTH WARNING:", message);
    },
    debug(message) {
      console.log("AUTH DEBUG:", message);
    },
  },
  pages: {
    error: "/auth/error", // Create this page to handle errors
  },
});
