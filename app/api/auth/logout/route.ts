import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const headerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const token = headerToken ?? request.cookies.get("pos_token")?.value;

  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.session.deleteMany({ where: { token_hash: tokenHash } });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("pos_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
