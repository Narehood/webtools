import bcrypt from "bcryptjs";

export async function htpasswdLine(username: string, password: string) {
  const user = username.trim();
  if (!user) throw new Error("Enter a username");
  if (user.includes(":")) throw new Error("Username cannot contain a colon");
  if (!password) throw new Error("Enter a password");
  const hash = (await bcrypt.hash(password, 10)).replace(/^\$2[ab]\$/, "$2y$");
  return `${user}:${hash}`;
}
