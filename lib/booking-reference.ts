import { Prisma } from "@prisma/client";

export async function nextBookingReference(transaction: Prisma.TransactionClient) {
  // Queue concurrent counter check-ins without requiring another database table.
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('jaskids_pos_booking_reference'))`;
  const rows = await transaction.$queryRaw<Array<{ reference_no: string }>>`
    SELECT reference_no
    FROM bookings
    WHERE reference_no ~ '^JK[A-Z][0-9]{4}$'
    ORDER BY reference_no DESC
    LIMIT 1
  `;
  const match = rows[0]?.reference_no.match(/^JK([A-Z])(\d{4})$/);
  const letter = match?.[1] ?? "A";
  const number = match ? Number(match[2]) : 0;
  const nextNumber = number === 9999 ? 1 : number + 1;
  const nextLetterCode = letter.charCodeAt(0) + (number === 9999 ? 1 : 0);
  if (nextLetterCode > "Z".charCodeAt(0)) throw new Error("BOOKING_REFERENCE_LIMIT_REACHED");
  return `JK${String.fromCharCode(nextLetterCode)}${String(nextNumber).padStart(4, "0")}`;
}
