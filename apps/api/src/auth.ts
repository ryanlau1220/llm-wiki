import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { Elysia } from "elysia";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDbClient, users } from "@llm-wiki/db";
import type { AppConfig } from "./config";

export function authPlugin(config: AppConfig) {
  return new Elysia({ name: "auth" })
    .use(
      jwt({
        name: "jwt",
        secret: config.jwtSecret,
        exp: "7d"
      })
    )
    .use(cookie())
    .derive(async ({ jwt, cookie: { session }, request }) => {
      console.log("[Auth] Derive triggered for request");
      const getUser = async () => {
        // Try Authorization header first (Bearer token)
        const authHeader = request.headers.get("Authorization");
        let token = "";
        
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.substring(7);
          console.log("[Auth] Found Bearer token in header");
        } else {
          // Fallback to cookie
          token = session.value as string;
          if (token) console.log("[Auth] Found session cookie");
        }

        if (!token) {
          console.log("[Auth] No authentication token found (cookie or header)");
          return null;
        }
        
        const payload = await jwt.verify(token);
        if (!payload) {
          console.log("[Auth] Session cookie found but verification failed");
          return null;
        }

        return {
          id: payload.id as string,
          email: payload.email as string,
          role: payload.role as string
        };
      };

      return {
        user: await getUser()
      };
    })
    .macro(({ onBeforeHandle }) => ({
      isAuth(enabled: boolean) {
        if (!enabled) return;

        onBeforeHandle(async ({ user, set }: any) => {
          if (!user) {
            set.status = 401;
            return "Unauthorized";
          }
        });
      }
    }));
}

export async function verifyUser(config: AppConfig, email: string, password: string) {
  const { db } = createDbClient(config.databaseUrl!);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

export async function seedDefaultUser(config: AppConfig) {
  const { db } = createDbClient(config.databaseUrl!);
  
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) return;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await db.insert(users).values({
    email: "admin@llmwiki.local",
    password_hash: passwordHash,
    role: "admin"
  });

  console.log("Default admin user created: admin@llmwiki.local / admin123");
}
