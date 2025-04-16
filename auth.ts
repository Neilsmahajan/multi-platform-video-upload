import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { customFetch } from "next-auth";

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
      id: "instagram",
      name: "Instagram",
      type: "oauth",
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      async [customFetch](
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );

        // Handle the token endpoint specially
        if (url.pathname.endsWith("/oauth/access_token")) {
          const customHeaders = {
            ...init?.headers,
            "content-type": "application/x-www-form-urlencoded",
          };

          // Create a proper form body with all required parameters
          const formData = new URLSearchParams();

          if (init?.body) {
            // Parse existing body if it exists
            const existingBody = new URLSearchParams(init.body as string);

            // Add each parameter from existing body
            for (const [key, value] of existingBody.entries()) {
              formData.append(key, value);
            }
          }

          // Make sure client_id and client_secret are included
          if (!formData.has("client_id")) {
            formData.append("client_id", process.env.AUTH_INSTAGRAM_ID!);
          }

          if (!formData.has("client_secret")) {
            formData.append(
              "client_secret",
              process.env.AUTH_INSTAGRAM_SECRET!,
            );
          }

          // Make the request with the properly formatted body
          const response = await fetch(url, {
            ...init,
            method: "POST",
            headers: customHeaders,
            body: formData.toString(),
          });

          const data = await response.json();
          return Response.json(data);
        }

        return fetch(input, init);
      },
      authorization: {
        url: "https://www.instagram.com/oauth/authorize",
        params: {
          client_id: process.env.AUTH_INSTAGRAM_ID,
          scope: "instagram_business_basic,instagram_business_content_publish",
          response_type: "code",
        },
      },
      token: "https://api.instagram.com/oauth/access_token",
      userinfo:
        "https://graph.instagram.com/me?fields=id,username,account_type,name",
      profile(profile) {
        return {
          id: profile.id || profile.user_id,
          name: profile.username || profile.name,
          email: null, // Instagram doesn't provide email
          image: null,
        };
      },
    },
    {
      id: "tiktok",
      name: "TikTok",
      type: "oauth",
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      async [customFetch](
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );
        if (url.pathname.endsWith("/token/")) {
          const customHeaders = {
            ...init?.headers,
            "content-type": "application/x-www-form-urlencoded",
          };

          const customBody = new URLSearchParams((init?.body as string) || "");
          customBody.append("client_key", process.env.AUTH_TIKTOK_ID!);

          const response = await fetch(input, {
            ...init,
            headers: customHeaders,
            body: customBody.toString(),
          });
          const json = await response.json();
          return Response.json({ ...json });
        }
        return fetch(input, init);
      },
      authorization: {
        url: "https://www.tiktok.com/v2/auth/authorize",
        params: {
          client_key: process.env.AUTH_TIKTOK_ID,
          scope: "user.info.profile,video.upload", // Using proper scope format
          response_type: "code",
        },
      },
      token: "https://open.tiktokapis.com/v2/oauth/token/",
      userinfo:
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username",
      profile(profile) {
        return {
          id: profile.data.user.open_id,
          name: profile.data.user.display_name,
          image: profile.data.user.avatar_url,
          email: null, // Email is not supported by TikTok
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
