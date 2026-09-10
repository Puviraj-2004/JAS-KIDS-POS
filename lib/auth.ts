import type { Staff } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { verifyToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getCurrentStaff(request: Request): Promise<Staff | null> {
  try {
    const cookieToken = request.headers
      .get("cookie")
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("pos_token="))
      ?.slice("pos_token=".length);
    const authorization = request.headers.get("authorization");
    const headerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;
    const token = cookieToken ? decodeURIComponent(cookieToken) : headerToken;

    if (!token || !verifyToken(token)) return null;

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await prisma.session.findUnique({
      where: { token_hash: tokenHash },
      include: { staff: true },
    });

    if (!session || session.expires_at <= new Date() || !session.staff.is_active) return null;
    return session.staff;
  } catch {
    return null;
  }
}
