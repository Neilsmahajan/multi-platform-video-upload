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
      wellKnown: undefined,
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      checks: ["state"],
      async [customFetch](
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );

        // Add debug logs
        console.log("Instagram OAuth URL:", url.toString());

        // Handle the token endpoint
        if (url.pathname.endsWith("/oauth/access_token")) {
          console.log("Processing Instagram token exchange");

          const formData = new URLSearchParams();

          // Parse the body if it exists
          if (init?.body) {
            const bodyParams = new URLSearchParams(init.body as string);
            for (const [key, value] of bodyParams.entries()) {
              formData.append(key, value);
            }
          }

          // Ensure required params are included
          formData.append("client_id", process.env.AUTH_INSTAGRAM_ID!);
          formData.append("client_secret", process.env.AUTH_INSTAGRAM_SECRET!);

          try {
            console.log(
              "Instagram token request params:",
              Object.fromEntries(formData.entries()),
            );

            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("Instagram token error response:", errorText);
              return new Response(
                JSON.stringify({ error: "Token endpoint error" }),
                {
                  status: response.status,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            const data = await response.json();
            console.log("Instagram raw token response:", data);

            // Transform Instagram's response to the format Auth.js expects
            const transformedData = {
              access_token: data.access_token,
              token_type: "Bearer",
              scope:
                "instagram_business_basic,instagram_business_content_publish",
            };

            console.log("Transformed token data:", transformedData);
            return Response.json(transformedData);
          } catch (error) {
            console.error("Instagram token exchange error:", error);
            return new Response(
              JSON.stringify({ error: "Failed to exchange token" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
        }

        // For userinfo endpoint, make sure to append the access token
        if (url.pathname.includes("/graph.instagram.com/me")) {
          const accessToken =
            (init?.headers &&
            typeof init.headers === "object" &&
            "Authorization" in init.headers
              ? (init.headers as Record<string, string>)["Authorization"]
              : init?.headers instanceof Headers
                ? init.headers.get("Authorization")
                : undefined
            )
              ?.toString()
              ?.replace("Bearer ", "") ||
            new URLSearchParams(url.search).get("access_token");

          if (accessToken) {
            url.searchParams.set("access_token", accessToken);
            console.log("Fetching Instagram user info:", url.toString());
            return fetch(url.toString(), {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
            });
          }
        }

        // Default handling for other requests
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
        console.log("Instagram profile data:", profile);
        return {
          id: profile.id,
          name: profile.username || profile.name,
          email: null,
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
    async jwt({ token, account, user }) {
      // Initial sign in
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          userId: user.id,
        };
      }
      return token;
    },
    // Handle session callback
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.provider = token.provider as string;
        session.user.refreshToken = token.refreshToken as string;
        session.user.accessToken = token.accessToken as string;
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
