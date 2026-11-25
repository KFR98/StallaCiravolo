"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { run, fd, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { cleanName, customerKey } from "@/lib/customers";

const schema = z.object({
  name: z.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(120),
  missiva: z.string().trim().max(40).nullable(),
  contact: z.string().trim().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
});

/** Nuovo cliente (chi vede la rubrica) o modifica (chi la gestisce). */
export async function saveCustomer(form: FormData) {
  return run(async () => {
    const f = fd(form);
    const id = f.int("id");
    const user = await assertPermission(id ? "customers.manage" : "customers.view");
    const data = schema.parse({ name: f.str("name"), missiva: f.opt("missiva")?.toUpperCase() ?? null, contact: f.opt("contact"), notes: f.opt("notes") });
    const name = cleanName(data.name);
    const key = customerKey(name);
    const clash = await prisma.customer.findUnique({ where: { nameKey: key }, select: { id: true } });
    if (clash && clash.id !== id) throw new UserError("C'è già un cliente con questo nome. Se è la stessa persona, usa “Unisci”.");
    if (id) {
      const before = await prisma.customer.findUnique({ where: { id } });
      if (!before) throw new UserError("Cliente non trovato.");
      await prisma.customer.update({ where: { id }, data: { ...data, name, nameKey: key } });
      await audit(user, "CLIENTE", "Cliente", id, `Modificato il cliente ${name}`, { prima: { nome: before.name, missiva: before.missiva, contatto: before.contact }, dopo: { nome: name, missiva: data.missiva, contatto: data.contact } });
      revalidatePath("/clienti");
      return { ok: true, message: "Cliente aggiornato." };
    }
    const c = await prisma.customer.create({ data: { ...data, name, nameKey: key, createdById: user.id } });
    await audit(user, "CLIENTE", "Cliente", c.id, `Nuovo cliente ${name}`);
    revalidatePath("/clienti");
    return { ok: true, message: "Cliente aggiunto.", redirect: `/clienti/${c.id}` };
  });
}

/** Unisce due schede dello stesso cliente: acquisti e prenotazioni passano al cliente che resta. */
export async function mergeCustomers(form: FormData) {
  return run(async () => {
    const user = await assertPermission("customers.manage");
    const f = fd(form);
    const from = f.int("id") ?? 0;
    const into = f.int("into") ?? 0;
    if (!from || !into || from === into) throw new UserError("Scegli il cliente con cui unirlo.");
    const [a, b] = await Promise.all([prisma.customer.findUnique({ where: { id: from } }), prisma.customer.findUnique({ where: { id: into } })]);
    if (!a || !b) throw new UserError("Cliente non trovato.");
    const moved = await prisma.$transaction(async (tx) => {
      const s = await tx.sale.updateMany({ where: { customerId: from }, data: { customerId: into } });
      const i = await tx.itemSale.updateMany({ where: { customerId: from }, data: { customerId: into } });
      const r = await tx.reservation.updateMany({ where: { customerId: from }, data: { customerId: into } });
      await tx.customer.update({ where: { id: into }, data: { missiva: b.missiva ?? a.missiva, contact: b.contact ?? a.contact, notes: [b.notes, a.notes].filter(Boolean).join("\n") || null } });
      await tx.customer.delete({ where: { id: from } });
      await audit(user, "UNISCI_CLIENTI", "Cliente", into, `Unito ${a.name} in ${b.name} (${s.count + i.count} vendite, ${r.count} prenotazioni)`, undefined, tx);
      return s.count + i.count;
    });
    revalidatePath("/clienti");
    return { ok: true, message: `Clienti uniti: ${moved} ${moved === 1 ? "vendita passata" : "vendite passate"} a ${b.name}.`, redirect: `/clienti/${into}` };
  });
}

/** Elimina la scheda: gli acquisti restano (con il nome scritto nella vendita), solo il collegamento si toglie. */
export async function deleteCustomer(form: FormData) {
  return run(async () => {
    const user = await assertPermission("customers.manage");
    const id = fd(form).int("id") ?? 0;
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw new UserError("Cliente non trovato.");
    await prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.itemSale.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.reservation.updateMany({ where: { customerId: id }, data: { customerId: null } });
      await tx.customer.delete({ where: { id } });
      await audit(user, "ELIMINA_CLIENTE", "Cliente", id, `Eliminata la scheda del cliente ${c.name} (le vendite restano)`, undefined, tx);
    });
    revalidatePath("/clienti");
    return { ok: true, message: "Scheda cliente eliminata. Le vendite restano nello storico.", redirect: "/clienti" };
  });
}
