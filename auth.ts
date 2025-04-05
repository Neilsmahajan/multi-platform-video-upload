import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import TikTok from "next-auth/providers/tiktok";
import Instagram from "next-auth/providers/instagram";
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
      token: {
        async request({
          params,
          provider,
        }: {
          params: { code: string };
          provider: {
            token: { url: string };
            clientId: string;
            clientSecret: string;
            callbackUrl: string;
          };
        }) {
          const res = await fetch(provider.token.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_key: provider.clientId,
              client_secret: provider.clientSecret,
              code: params.code,
              grant_type: "authorization_code",
              redirect_uri: provider.callbackUrl,
            }),
          });
          const tokens = await res.json();
          // Force access_token to be a string
          tokens.access_token = String(tokens.access_token);
          return { tokens };
        },
      },
      profile(profile) {
        return {
          id: profile.open_id,
          name: profile.display_name,
          email: profile.email || null,
          image: profile.avatar_url,
        };
      },
    }),
    Instagram({
      clientId: process.env.AUTH_INSTAGRAM_ID!,
      clientSecret: process.env.AUTH_INSTAGRAM_SECRET!,
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
