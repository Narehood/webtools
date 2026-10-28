import bcrypt from "bcryptjs";

export function assertBcryptPassword(password: string) {
  if (bcrypt.truncates(password))
    throw new Error("Bcrypt supports at most 72 UTF-8 bytes; longer input would be truncated.");
}
