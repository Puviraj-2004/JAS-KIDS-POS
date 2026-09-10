import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(
    atob(padded),
    (character) => character.charCodeAt(0),
  );
  return bytes.buffer;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.JWT_SECRET;
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    if (!secret || !encodedHeader || !encodedPayload || !encodedSignature) {
      return false;
    }

    const header = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedHeader)),
    ) as { alg?: string };
    if (header.alg !== "HS256") return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureIsValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );

    if (!signatureIsValid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as { exp?: number };

    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("pos_token")?.value;

  if (!token || !(await verifyToken(token))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pos/:path*", "/admin/:path*"],
};
