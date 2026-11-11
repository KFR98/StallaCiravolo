import { requireUser } from "@/lib/auth";
import { listBackups, BACKUP_DIR } from "@/lib/backup";
import { getSettings } from "@/lib/settings";
import { dateTime } from "@/lib/format";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card, TableWrap, Empty } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/ActionForm";
import { makeBackup, restoreFromFile } from "./actions";

export const metadata = { title: "Backup" };

export default async function BackupPage() {
  const me = await requireUser("data.backup");
  const [list, s] = await Promise.all([listBackups(), getSettings()]);
  return (
    <>
      <PageHeader title="Amministrazione" subtitle={`Copie di sicurezza del database: una all'avvio e poi ogni 24 ore. Vengono conservate per ${s.backupDays} giorni.`} />
      <AdminTabs role={me.role} active="backup" />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Backup disponibili" actions={<ActionButton action={makeBackup} label="Crea backup ora" className="btn btn-primary btn-sm" />}>
          {list.length === 0 ? <Empty>Nessun backup presente. Premi “Crea backup ora”.</Empty> : (
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>File</th><th>Data</th><th className="num">Dimensione</th><th /></tr></thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.file}>
                      <td className="text-[14px] break-all">{b.file}</td>
                      <td className="whitespace-nowrap">{dateTime(b.mtime)}</td>
                      <td className="num">{(b.size / 1024).toFixed(0)} KB</td>
                      <td><a className="btn btn-secondary btn-sm" href={`/api/backup/${encodeURIComponent(b.file)}`}>Scarica</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <p className="mt-3 text-[12.5px] break-all text-fg-3">Cartella: {BACKUP_DIR}</p>
        </Card>
        <div className="space-y-5">
          <Card title="Esporta dati">
            <div className="grid gap-2">
              {[["listino", "Listino e catalogo"], ["vendite", "Vendite"], ["cavalli", "Cavalli e catture"], ["pagamenti", "Pagamenti stipendi"]].map(([k, l]) => (
                <div key={k} className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-2">
                  <span>{l}</span>
                  <span className="flex gap-2"><a className="btn btn-secondary btn-sm" href={`/api/export/${k}`}>Excel</a><a className="btn btn-secondary btn-sm" href={`/api/export/${k}?formato=csv`}>CSV</a></span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Ripristino">
            <ActionForm action={restoreFromFile} confirm="ATTENZIONE: tutti i dati attuali verranno sostituiti con quelli del backup. Prima viene salvata automaticamente una copia dello stato attuale. Procedere?" className="space-y-3">
              <input type="file" name="file" accept="application/json,.json" required className="block w-full text-[14px]" />
              <label className="block"><span className="field-label">Scrivi RIPRISTINA per confermare</span><input name="conferma" className="input" required autoComplete="off" /></label>
              <button className="btn btn-danger">Ripristina database</button>
            </ActionForm>
            <p className="mt-2 text-[13px] text-fg-3">Le immagini sono file nella cartella upload: conservale con i backup del pannello.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
