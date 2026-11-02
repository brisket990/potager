/// <reference path="../pb_data/types.d.ts" />
// Enregistrement d'un jardin : la version envoyée doit être plus récente que celle en base.
// La règle d'accès le vérifie déjà, mais pas de façon atomique : deux envois simultanés avec la même
// version passeraient tous les deux et le second effacerait le premier. Ici, la vérification et
// l'écriture se font dans la même transaction (les écritures de PocketBase passent une par une).
onRecordUpdateRequest((e) => {
  e.app.runInTransaction((txApp) => {
    const actuel = txApp.findRecordById("jardins", e.record.id)
    if (e.record.getInt("version") <= actuel.getInt("version")) {
      throw new BadRequestError("Version dépassée : quelqu'un a enregistré entre-temps.", { version: "version_depassee" })
    }
    e.app = txApp
    e.next()
  })
}, "jardins")
