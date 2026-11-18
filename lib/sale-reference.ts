import { Prisma } from "@prisma/client";

export async function nextSaleReference(transaction: Prisma.TransactionClient) {
  // Queue concurrent sales so the next visible sale number is always unique.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('jaskids_pos_sale_reference'))`;
  const rows = await transaction.$queryRaw<Array<{ sale_no: string }>>`
    SELECT sale_no
    FROM sales
    WHERE sale_no ~ '^SA-[A-Z]-[0-9]{4}$'
    ORDER BY sale_no DESC
    LIMIT 1
  `;
  const match = rows[0]?.sale_no.match(/^SA-([A-Z])-(\d{4})$/);
  const letter = match?.[1] ?? "A";
  const number = match ? Number(match[2]) : 0;
  const nextNumber = number === 9999 ? 1 : number + 1;
  const nextLetterCode = letter.charCodeAt(0) + (number === 9999 ? 1 : 0);
  if (nextLetterCode > "Z".charCodeAt(0)) throw new Error("SALE_REFERENCE_LIMIT_REACHED");
  return `SA-${String.fromCharCode(nextLetterCode)}-${String(nextNumber).padStart(4, "0")}`;
}
