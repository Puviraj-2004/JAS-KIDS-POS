import { createHash, randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { comparePassword } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSessionMaxAgeSeconds(): number {
  const match = process.env.JWT_EXPIRES_IN?.match(/^(\d+)([smhd])$/);
  if (!match) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ success: false, error: "Email and password are required" }, { status: 400 });

  const staff = await prisma.staff.findUnique({ where: { email } });
  const passwordIsValid = staff?.password_hash !== "SUPABASE_AUTH_MANAGED" && await comparePassword(password, staff?.password_hash ?? "");
  const validRole = staff?.role === Role.SUPER_ADMIN || staff?.role === Role.BRANCH_ADMIN || staff?.role === Role.CASHIER;
  if (!staff || !validRole || !staff.is_active || !passwordIsValid || (staff.role !== Role.SUPER_ADMIN && !staff.branch_id)) {
    return NextResponse.json({ success: false, error: "Invalid email or password" }, { status: 401 });
  }

  const maxAgeSeconds = getSessionMaxAgeSeconds();
  const token = signToken({ session_id: randomBytes(32).toString("hex"), user_id: staff.id });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { staff_id: staff.id, expires_at: { lte: new Date() } } }),
    prisma.session.create({ data: { staff_id: staff.id, token_hash: tokenHash, expires_at: new Date(Date.now() + maxAgeSeconds * 1000) } }),
  ]);

  const response = NextResponse.json({
    success: true,
    staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role, branch_id: staff.branch_id },
    redirect_to: staff.role === Role.CASHIER ? "/pos/dashboard" : "/admin",
  });
  response.cookies.set("pos_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: maxAgeSeconds, path: "/" });
  return response;
}
