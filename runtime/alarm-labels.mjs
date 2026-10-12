export function alarmStateLabel(row) {
  if (row.active === null) return "In attesa del segnale";
  if (row.active) return row.acknowledged ? "Attivo · preso in visione" : "Attivo";
  if (row.pending) return row.acknowledged ? "Rientrato · da confermare" : "Rientrato · da prendere in visione";
  return "Normale";
}
