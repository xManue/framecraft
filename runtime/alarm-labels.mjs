export function alarmStateLabel(row) {
  const state = row.active === null ? "In attesa del segnale" : row.active ? row.acknowledged ? "Attivo · preso in visione" : "Attivo" : row.pending ? row.acknowledged ? "Rientrato · da confermare" : "Rientrato · da prendere in visione" : "Normale";
  return (row.shelving ? "Segnalazione sospesa · " : "") + state;
}
