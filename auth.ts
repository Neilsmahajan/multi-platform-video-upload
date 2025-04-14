import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
// import Instagram from "next-auth/providers/instagram";
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
    {
      id: "tiktok",
      name: "TikTok",
      type: "oauth",
      authorization: {
        url: "https://www.tiktok.com/v2/auth/authorize/",
        params: {
          client_key: process.env.AUTH_TIKTOK_ID,
          scope: "user.info.basic", // Simplified scope
          response_type: "code",
        },
      },
      token: {
        url: "https://open.tiktokapis.com/v2/oauth/token/",
        async request({
          params,
        }: {
          params: { code: string; [key: string]: unknown };
          provider: unknown;
          client_id?: string;
        }) {
          // Construct the token request manually to ensure correct format
          const response = await fetch(
            "https://open.tiktokapis.com/v2/oauth/token/",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                client_key: process.env.AUTH_TIKTOK_ID!,
                client_secret: process.env.AUTH_TIKTOK_SECRET!,
                code: params.code,
                grant_type: "authorization_code",
              }).toString(),
            },
          );

          const tokens = await response.json();
          console.log("TikTok token response:", tokens);

          if (!response.ok)
            throw new Error(
              tokens.error_description || "Failed to get access token",
            );

          return {
            tokens,
          };
        },
      },
      userinfo: {
        url: "https://open.tiktokapis.com/v2/user/info/",
        async request({
          tokens,
        }: {
          tokens: { access_token: string; [key: string]: unknown };
        }) {
          const response = await fetch(
            "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username",
            {
              headers: {
                Authorization: `Bearer ${tokens.access_token}`,
              },
            },
          );

          const profile = await response.json();
          console.log("TikTok profile response:", profile);

          return profile;
        },
      },
      profile(profile) {
        return {
          id: profile.data?.user?.open_id || profile.data?.user?.union_id,
          name: profile.data?.user?.display_name,
          image: profile.data?.user?.avatar_url,
          email: null,
        };
      },
    },
    // Instagram({
    //   clientId: process.env.AUTH_INSTAGRAM_ID!,
    //   clientSecret: process.env.AUTH_INSTAGRAM_SECRET!,
    // }),
  ],
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 900, // 15 minutes in seconds
      },
    },
  },
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
  debug: true, // Always enable debug for troubleshooting
  logger: {
    error(error) {
      console.error(error);
    },
    warn(message) {
      console.warn(message);
    },
    debug(message) {
      console.log(message);
    },
  },
});
