import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.POS_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.POS_SUPER_ADMIN_PASSWORD;
  const name = process.env.POS_SUPER_ADMIN_NAME?.trim() || "JAS Kids Super Admin";
  if (!email || !password || password.length < 8) {
    throw new Error("POS_SUPER_ADMIN_EMAIL and POS_SUPER_ADMIN_PASSWORD (minimum 8 characters) are required");
  }
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.staff.upsert({
    where: { email },
    update: {
      name,
      password_hash: passwordHash,
      role: Role.SUPER_ADMIN,
      branch_id: null,
    },
    create: {
      name,
      email,
      password_hash: passwordHash,
      role: Role.SUPER_ADMIN,
      branch_id: null,
    },
  });

  for (const name of ["Electricity", "Salary", "Rent", "Operations", "Maintenance", "Transport", "Cleaning", "Other"]) {
    await prisma.expenseType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
