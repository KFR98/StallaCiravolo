"use server";

import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { TZ } from "@/lib/format";

const STATUSES = ["DA_CATTURARE", "PRENOTATO", "VENDIBILE_DA_TUTTI", "AFFARE_CHIUSO", "ANNULLATO"] as const;

function parse(form: FormData) {
  const f = fd(form);
  const date = f.str("deliveryDate");
  return z
    .object({
      title: z.string().max(150).nullable(),
      customerName: z.string().max(120).nullable(),
      missiva: z.string().max(40).nullable(),
      breedId: z.number().int().positive().nullable(),
      coatId: z.number().int().positive().nullable(),
      plate: z.string().max(40).nullable(),
      price: z.number().min(0, "Prezzo non valido").nullable(),
      deposit: z.number().min(0, "Acconto non valido").nullable(),
      deliveryDate: z.date().nullable(),
      status: z.enum(STATUSES),
      assignedToId: z.number().int().positive().nullable(),
      notes: z.string().max(5000).nullable(),
    })
    .refine((d) => d.title || d.customerName || d.notes, { message: "Inserisci almeno un titolo, un cliente o una nota." })
    .parse({
      title: f.opt("title"),
      customerName: f.opt("customerName"),
      missiva: f.opt("missiva"),
      breedId: f.int("breedId"),
      coatId: f.int("coatId"),
      plate: f.opt("plate")?.toUpperCase() ?? null,
      price: f.num("price"),
      deposit: f.num("deposit"),
      deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? fromZonedTime(date + "T12:00:00", TZ) : null,
      status: f.str("status") || "PRENOTATO",
      assignedToId: f.int("assignedToId"),
      notes: f.opt("notes"),
    });
}

export async function saveReservation(form: FormData) {
  return run(async () => {
    const user = await assertPermission("reservations.edit");
    const id = fd(form).int("id");
    const data = parse(form);
    if (data.coatId && data.breedId) {
      const ok = await prisma.coat.count({ where: { id: data.coatId, breedId: data.breedId } });
      if (!ok) throw new UserError("Il manto non appartiene alla razza scelta.");
    }
    if (data.price != null && data.deposit != null && data.deposit > data.price) throw new UserError("L'acconto supera il prezzo.");
    if (id) {
      const before = await prisma.reservation.findUnique({ where: { id } });
      if (!before) throw new UserError("Nota non trovata.");
      await prisma.reservation.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await audit(user, "MODIFICA_PRENOTAZIONE", "Prenotazione", id, `Modificata nota/prenotazione #${id} (${data.status})`);
      return { ok: true, message: "Nota aggiornata." };
    }
    const r = await prisma.reservation.create({ data: { ...data, createdById: user.id } });
    await audit(user, "NUOVA_PRENOTAZIONE", "Prenotazione", r.id, `Nuova nota/prenotazione #${r.id}`);
    return { ok: true, message: "Nota creata." };
  });
}

export async function setReservationStatus(form: FormData) {
  return run(async () => {
    const user = await assertPermission("reservations.edit");
    const f = fd(form);
    const id = f.int("id") ?? 0;
    const status = z.enum(STATUSES).parse(f.str("status"));
    await prisma.reservation.update({ where: { id }, data: { status, updatedById: user.id } });
    await audit(user, "STATO_PRENOTAZIONE", "Prenotazione", id, `Prenotazione #${id} → ${status}`);
    return { ok: true, message: "Stato aggiornato." };
  });
}

export async function deleteReservation(form: FormData) {
  return run(async () => {
    const user = await assertPermission("reservations.delete");
    const id = fd(form).int("id") ?? 0;
    const r = await prisma.reservation.findUnique({ where: { id } });
    if (!r) throw new UserError("Nota non trovata.");
    await prisma.reservation.delete({ where: { id } });
    await audit(user, "ELIMINA_PRENOTAZIONE", "Prenotazione", id, `Eliminata nota/prenotazione #${id}`, r);
    return { ok: true, message: "Nota eliminata." };
  });
}
