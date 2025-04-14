import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { randomBytes } from "crypto";

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
          scope: "user.info.basic",
          response_type: "code",
          redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/tiktok`,
          state: generateStateParam(),
        },
      },
      token: {
        url: "https://open.tiktokapis.com/v2/oauth/token/",
        request: async ({
          params,
        }: {
          params: { code: string; [key: string]: unknown };
          provider: unknown;
        }) => {
          try {
            console.log("TikTok token request params:", params);

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
                  code: params.code as string,
                  grant_type: "authorization_code",
                  redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/tiktok`,
                }).toString(),
              },
            );

            const responseData = await response.json();
            console.log(
              "TikTok token response:",
              JSON.stringify(responseData, null, 2),
            );

            if (!response.ok) {
              throw new Error(
                `TikTok token error: ${
                  responseData.error || response.statusText
                }`,
              );
            }

            // NextAuth expects the token in a specific format
            return {
              tokens: {
                access_token: responseData.access_token,
                token_type: responseData.token_type,
                refresh_token: responseData.refresh_token,
                expires_at:
                  Math.floor(Date.now() / 1000) + responseData.expires_in,
                scope: responseData.scope,
              },
            };
          } catch (error) {
            console.error("TikTok token request error:", error);
            throw error;
          }
        },
      },
      userinfo: {
        url: "https://open.tiktokapis.com/v2/user/info/",
        request: async ({
          tokens,
        }: {
          tokens: {
            access_token: string;
            token_type?: string;
            refresh_token?: string;
            expires_at?: number;
            scope?: string;
          };
        }) => {
          try {
            const response = await fetch(
              "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username",
              {
                headers: {
                  Authorization: `Bearer ${tokens.access_token}`,
                },
              },
            );

            const profile = await response.json();
            console.log(
              "TikTok profile response:",
              JSON.stringify(profile, null, 2),
            );

            if (!response.ok) {
              throw new Error(
                `TikTok userinfo error: ${profile.error || response.statusText}`,
              );
            }

            return profile;
          } catch (error) {
            console.error("TikTok userinfo request error:", error);
            throw error;
          }
        },
      },
      profile(profile) {
        if (!profile.data?.user?.open_id) {
          console.error("TikTok profile missing open_id:", profile);
        }

        return {
          id: profile.data?.user?.open_id || "tiktok-user",
          name: profile.data?.user?.display_name || "TikTok User",
          image: profile.data?.user?.avatar_url,
          email: null,
        };
      },
    },
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

// Helper function to generate a crypto-secure state parameter
function generateStateParam(): string {
  return randomBytes(32).toString("hex");
}
