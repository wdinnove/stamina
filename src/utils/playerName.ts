interface NamedPerson {
  firstName: string;
  lastName: string;
}

/** Format d'identité unique dans toute l'app : "Prénom NOM" — prénom en casse naturelle, nom en majuscule. */
export function playerNameFull(p: NamedPerson): string {
  return `${p.firstName} ${p.lastName.toUpperCase()}`;
}

/** Version compacte quand la place manque : "Prénom N." — nom réduit à 1 lettre majuscule. */
export function playerNameShort(p: NamedPerson): string {
  return `${p.firstName} ${(p.lastName?.[0] ?? '').toUpperCase()}.`;
}
