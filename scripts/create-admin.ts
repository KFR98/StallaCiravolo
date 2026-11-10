/**
 * Crea (o reimposta) un account amministratore da console.
 *   npm run admin:create -- <username> <password>
 */
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/lib/db";

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password || password.length < 8) throw new Error("Uso: npm run admin:create -- <username> <password (min 8)>");
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const u = await prisma.user.upsert({
    where: { username },
    create: { username, displayName: username, role: "ADMIN", passwordHash },
    update: { role: "ADMIN", active: true, passwordHash },
  });
  await prisma.session.deleteMany({ where: { userId: u.id } });
  console.log(`Account admin pronto: ${u.username}`);
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
