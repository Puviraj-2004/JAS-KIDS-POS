import jwt, { type SignOptions } from "jsonwebtoken";

export function signToken(payload: object): string {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): object | null {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string);
    return typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}
