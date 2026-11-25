"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function sriLankaDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function SriLankaDateInput({ initialDate }: { initialDate?: string }) {
  const [value, setValue] = useState(initialDate ?? "");
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (initialDate) return;
    const today = sriLankaDate();
    setValue(today);
    const params = new URLSearchParams(window.location.search);
    params.set("date", today);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [initialDate, pathname, router]);
  return <label><span>Booking date</span><input name="date" type="date" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Booking date" /></label>;
}
