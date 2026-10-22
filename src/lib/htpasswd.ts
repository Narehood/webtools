import bcrypt from "bcryptjs";
import { assertBcryptPassword } from "./bcryptPassword.ts";

export async function htpasswdLine(username: string, password: string) {
  if (/[\x00-\x1f\x7f:]/.test(username))
    throw new Error("Username cannot contain a colon or control characters");
  const user = username.trim();
  if (!user) throw new Error("Enter a username");
  if (!password) throw new Error("Enter a password");
  assertBcryptPassword(password);
  const hash = (await bcrypt.hash(password, 10)).replace(/^\$2[ab]\$/, "$2y$");
  return `${user}:${hash}`;
}
