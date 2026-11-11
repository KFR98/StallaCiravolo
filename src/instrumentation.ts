/** Eseguito una volta all'avvio del server Next.js. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupScheduler } = await import("./lib/backup-scheduler");
    startBackupScheduler();
  }
}
