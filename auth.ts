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
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      authorization: {
        url: "https://www.tiktok.com/v2/auth/authorize/",
        params: {
          client_key: process.env.AUTH_TIKTOK_ID,
          scope: "user.info.basic",
          response_type: "code",
        },
      },
      token: {
        url: "https://open.tiktokapis.com/v2/oauth/token/",
        params: {
          client_key: process.env.AUTH_TIKTOK_ID,
          client_secret: process.env.AUTH_TIKTOK_SECRET,
          grant_type: "authorization_code",
        },
      },
      userinfo: {
        url: "https://open.tiktokapis.com/v2/user/info/",
        request: ({ tokens }: { tokens: { access_token: string } }) => {
          return {
            url: "https://open.tiktokapis.com/v2/user/info/",
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
            params: {
              fields: "open_id,avatar_url,display_name,username",
            },
          };
        },
      },
      profile(profile) {
        return {
          id: profile.data?.user?.open_id || "unknown",
          name: profile.data?.user?.display_name || "TikTok User",
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
      console.error("AUTH ERROR:", error);
    },
    warn(message) {
      console.warn("AUTH WARNING:", message);
    },
    debug(message) {
      console.log("AUTH DEBUG:", message);
    },
  },
});
