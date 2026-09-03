import { describe, it, expect } from 'vitest';
import {
  parseTacticalThemeCsv, categoryNameFromFileName, defaultThemeColumnSelection,
  guessValeurColumnIndex, buildThemeBlock, filterInvalidValeurRows, parseTacticalCsv,
  parseTacticalConfigCsv, serializeTacticalConfigCsv,
} from './tacticalCsvParser';

/** Extrait réel d'un export "un fichier par thème" : BOM, séparateur `;`, colonnes de
 *  repérage vidéo en tête, et la colonne des points nommée "Rentabilite". */
const DEFENSE_PICK = `﻿Debut;Fin;N°;Joueuses;Forme de jeu;Zone;Finalite;Rentabilite
09:48;10:06;Defense Pick 001;#3 Melissa, #9 Lau;Protect;P-SIDE 5;Faute;1
14:00;14:18;Defense Pick 002;#1 Yana, #0 Cynthia;Switch;P-SIDE 5;Rebond defensif;0
36:24;36:42;Defense Pick 003;#6 Eva Th;Switch;P-TOP 5;Scoring;3
`;

/** Fichier parsé + sélection de colonnes par défaut, comme à l'ouverture dans l'écran d'import. */
function openThemeFile(fileName: string, text: string) {
  const file = parseTacticalThemeCsv(fileName, text);
  const selected = defaultThemeColumnSelection(file);
  return { file, selected, valeurIndex: guessValeurColumnIndex(file, selected) };
}

describe('categoryNameFromFileName', () => {
  it('retire l\'extension et rend les underscores aux espaces', () => {
    expect(categoryNameFromFileName('Defense_Pick.csv')).toBe('Defense Pick');
    expect(categoryNameFromFileName('Attaque_vs_M2M.csv')).toBe('Attaque vs M2M');
  });

  it('conserve les tirets, qui font partie des noms de systèmes', () => {
    expect(categoryNameFromFileName('Defense_tout-terrain.csv')).toBe('Defense tout-terrain');
  });
});

describe('parseTacticalThemeCsv', () => {
  const file = parseTacticalThemeCsv('Defense_Pick.csv', DEFENSE_PICK);

  it('prend le nom de la catégorie sur le fichier', () => {
    expect(file.categoryName).toBe('Defense Pick');
  });

  it('garde TOUTES les colonnes, en ne décochant que le repérage vidéo', () => {
    expect(file.columns.map(c => c.name)).toEqual(['Debut', 'Fin', 'N°', 'Joueuses', 'Forme de jeu', 'Zone', 'Finalite', 'Rentabilite']);
    expect(file.columns.filter(c => !c.importedByDefault).map(c => c.name)).toEqual(['Debut', 'Fin', 'N°']);
    expect(defaultThemeColumnSelection(file)).toEqual([3, 4, 5, 6, 7]);
  });

  it('aligne chaque ligne sur toutes les colonnes, sélection comprise ou non', () => {
    expect(file.rows[0]).toEqual(['09:48', '10:06', 'Defense Pick 001', '#3 Melissa, #9 Lau', 'Protect', 'P-SIDE 5', 'Faute', '1']);
    expect(file.rows).toHaveLength(3);
  });

  it('corrige le mojibake des accents et du BOM des exports vidéo', () => {
    const mojibake = 'ï»¿Debut;NÂ°;FinalitÃ©\n09:48;X 001;RÃ©ussi\n';
    const f = parseTacticalThemeCsv('Attaque_vs_M2M.csv', mojibake);
    expect(f.columns.map(c => c.name)).toEqual(['Debut', 'N°', 'Finalité']);
    expect(f.rows).toEqual([['09:48', 'X 001', 'Réussi']]);
  });

  it('ignore les lignes entièrement vides sans perdre les suivantes', () => {
    const withGap = 'Debut;Finalite\n\n09:48;Faute\n;\n10:06;Scoring\n';
    expect(parseTacticalThemeCsv('T.csv', withGap).rows).toEqual([['09:48', 'Faute'], ['10:06', 'Scoring']]);
  });

  it('marque comme inutilisables une colonne en double et une colonne sans titre', () => {
    const f = parseTacticalThemeCsv('T.csv', 'Finalite;;Finalité\nFaute;x;Scoring\n');
    expect(f.columns.map(c => c.unavailableReason)).toEqual([undefined, 'unnamed', 'duplicate']);
    expect(defaultThemeColumnSelection(f)).toEqual([0]);
  });

  it('ne produit aucune ligne pour un fichier sans données', () => {
    expect(parseTacticalThemeCsv('Vide.csv', '').columns).toEqual([]);
    expect(parseTacticalThemeCsv('Vide.csv', 'Debut;Finalite\n').rows).toEqual([]);
  });
});

describe('guessValeurColumnIndex', () => {
  it('propose la colonne "Rentabilite" à défaut de "Valeur"', () => {
    const { file, selected, valeurIndex } = openThemeFile('Defense_Pick.csv', DEFENSE_PICK);
    expect(valeurIndex).not.toBeNull();
    expect(file.columns[valeurIndex!].name).toBe('Rentabilite');
    expect(selected).toContain(valeurIndex);
  });

  it('préfère "Valeur" quand les deux existent', () => {
    const file = parseTacticalThemeCsv('T.csv', 'Rentabilite;Valeur\n1;2\n');
    expect(guessValeurColumnIndex(file, [0, 1])).toBe(1);
  });

  it('ne propose jamais une colonne non sélectionnée', () => {
    const file = parseTacticalThemeCsv('T.csv', 'Finalite;Rentabilite\nFaute;1\n');
    expect(guessValeurColumnIndex(file, [0])).toBeNull();
  });
});

describe('buildThemeBlock', () => {
  const file = parseTacticalThemeCsv('Defense_Pick.csv', DEFENSE_PICK);

  it('ne retient que les colonnes choisies, dans l\'ordre du fichier', () => {
    const block = buildThemeBlock(file, [7, 3], null);
    expect(block.dimensionNames).toEqual(['Joueuses', 'Rentabilite']);
    expect(block.rows[0]).toEqual(['#3 Melissa, #9 Lau', '1']);
  });

  it('importe la colonne des points sous le nom "Valeur", seul nom reconnu par l\'analyse', () => {
    const block = buildThemeBlock(file, defaultThemeColumnSelection(file), 7);
    expect(block.dimensionNames).toEqual(['Joueuses', 'Forme de jeu', 'Zone', 'Finalite', 'Valeur']);
    expect(block.rows[0]).toEqual(['#3 Melissa, #9 Lau', 'Protect', 'P-SIDE 5', 'Faute', '1']);
  });

  it('permet d\'importer une colonne de repérage vidéo si l\'équipe la coche', () => {
    expect(buildThemeBlock(file, [0, 6], null).dimensionNames).toEqual(['Debut', 'Finalite']);
  });

  it('ne renomme rien quand aucune colonne de points n\'est désignée, ou qu\'elle est décochée', () => {
    expect(buildThemeBlock(file, [3, 7], null).dimensionNames).toEqual(['Joueuses', 'Rentabilite']);
    expect(buildThemeBlock(file, [3, 6], 7).dimensionNames).toEqual(['Joueuses', 'Finalite']);
  });

  it('n\'importe jamais une colonne inutilisable, même cochée', () => {
    const dup = parseTacticalThemeCsv('T.csv', 'Finalite;Finalité\nFaute;Scoring\n');
    expect(buildThemeBlock(dup, [0, 1], null).dimensionNames).toEqual(['Finalite']);
  });

  it('ne crée jamais deux dimensions "Valeur" dans la même catégorie', () => {
    const both = parseTacticalThemeCsv('T.csv', 'Valeur;Rentabilite\n2;1\n');
    expect(buildThemeBlock(both, [0, 1], 1).dimensionNames).toEqual(['Valeur', 'Rentabilite']);
  });
});

describe('import par thème + filterInvalidValeurRows', () => {
  it('écarte les actions sans valeur exploitable une fois la colonne des points désignée', () => {
    const csv = 'Debut;Rentabilite;Finalite\n09:48;1;Faute\n10:06;;Rebond defensif\n11:00;2;Scoring\n';
    const { file, selected, valeurIndex } = openThemeFile('Attaque_vs_M2M.csv', csv);
    const { blocks, excluded } = filterInvalidValeurRows([buildThemeBlock(file, selected, valeurIndex)]);
    expect(blocks[0].rows).toEqual([['1', 'Faute'], ['2', 'Scoring']]);
    expect(excluded).toEqual([{ categoryName: 'Attaque vs M2M', rawValue: '(vide)' }]);
  });

  it('garde toutes les actions tant qu\'aucune colonne de points n\'est désignée', () => {
    const csv = 'Debut;Rentabilite;Finalite\n09:48;1;Faute\n10:06;;Rebond defensif\n';
    const { file, selected } = openThemeFile('T.csv', csv);
    const { blocks, excluded } = filterInvalidValeurRows([buildThemeBlock(file, selected, null)]);
    expect(blocks[0].rows).toHaveLength(2);
    expect(excluded).toEqual([]);
  });
});

describe('parseTacticalCsv (format à blocs, inchangé)', () => {
  it('découpe toujours le fichier unique par ligne "Category:"', () => {
    const csv = 'Category: Offense M2M\nValeur,Finalité\n2,Panier\n\nCategory: Offense Transition\nValeur,Finalité\n0,Perte de balle\n';
    const blocks = parseTacticalCsv(csv);
    expect(blocks.map(b => b.categoryName)).toEqual(['Offense M2M', 'Offense Transition']);
    expect(blocks[0].rows).toEqual([['2', 'Panier']]);
  });
});

describe('parseTacticalConfigCsv', () => {
  const CONFIG = `﻿Categorie;Dimension;Options
Defense Pick;Forme de jeu;Protect;Step;Switch
Defense Pick;Zone;P-TOP 5;P-SIDE 5
Defense Pick;Valeur
Attaque rapide;FinalitÃ©;Scoring;Faute
`;

  it('regroupe le fichier en catégories → dimensions → options', () => {
    expect(parseTacticalConfigCsv(CONFIG)).toEqual([
      {
        name: 'Defense Pick',
        dimensions: [
          { name: 'Forme de jeu', options: ['Protect', 'Step', 'Switch'] },
          { name: 'Zone', options: ['P-TOP 5', 'P-SIDE 5'] },
          { name: 'Valeur', options: [] },
        ],
      },
      { name: 'Attaque rapide', dimensions: [{ name: 'Finalité', options: ['Scoring', 'Faute'] }] },
    ]);
  });

  it('accepte tout aussi bien une ligne par option', () => {
    const perOption = 'Categorie,Dimension,Option\nDefense Pick,Zone,P-TOP 5\nDefense Pick,Zone,P-SIDE 5\nDefense Pick,Forme de jeu,Switch\n';
    expect(parseTacticalConfigCsv(perOption)).toEqual([{
      name: 'Defense Pick',
      dimensions: [
        { name: 'Zone', options: ['P-TOP 5', 'P-SIDE 5'] },
        { name: 'Forme de jeu', options: ['Switch'] },
      ],
    }]);
  });

  it('se passe de ligne d\'en-tête', () => {
    expect(parseTacticalConfigCsv('Defense Pick;Zone;P-TOP 5\n')).toEqual([
      { name: 'Defense Pick', dimensions: [{ name: 'Zone', options: ['P-TOP 5'] }] },
    ]);
  });

  it('dédoublonne options, dimensions et catégories par nom normalisé', () => {
    const dup = 'Defense Pick;Zone;P-TOP 5;p-top 5\ndefense pick;ZONE;P-SIDE 5\n';
    expect(parseTacticalConfigCsv(dup)).toEqual([
      { name: 'Defense Pick', dimensions: [{ name: 'Zone', options: ['P-TOP 5', 'P-SIDE 5'] }] },
    ]);
  });

  it('crée la catégorie seule quand la dimension manque, et ignore une ligne sans catégorie', () => {
    expect(parseTacticalConfigCsv('Defense Pick\n;Zone;P-TOP 5\n')).toEqual([
      { name: 'Defense Pick', dimensions: [] },
    ]);
  });

  it('ignore les cellules vides ou marquées "/" entre deux options', () => {
    expect(parseTacticalConfigCsv('Defense Pick;Zone;P-TOP 5;;/;P-SIDE 5\n')[0].dimensions[0].options)
      .toEqual(['P-TOP 5', 'P-SIDE 5']);
  });

  it('ne renvoie rien pour un fichier vide', () => {
    expect(parseTacticalConfigCsv('')).toEqual([]);
    expect(parseTacticalConfigCsv('Categorie;Dimension;Options\n')).toEqual([]);
  });
});

describe('serializeTacticalConfigCsv', () => {
  const config = [
    { name: 'Defense Pick', dimensions: [
      { name: 'Forme de jeu', options: ['Protect', 'Switch'] },
      { name: 'Valeur', options: [] },
    ] },
    { name: 'Attaque rapide', dimensions: [] },
  ];

  it('écrit une ligne par dimension, options en colonnes', () => {
    expect(serializeTacticalConfigCsv(config)).toBe(
      'Categorie;Dimension;Options\n'
      + 'Defense Pick;Forme de jeu;Protect;Switch\n'
      + 'Defense Pick;Valeur\n'
      + 'Attaque rapide\n',
    );
  });

  it('fait l\'aller-retour avec le parseur sans rien perdre', () => {
    expect(parseTacticalConfigCsv(serializeTacticalConfigCsv(config))).toEqual(config);
  });

  it('protège une valeur contenant le séparateur ou un guillemet', () => {
    const tricky = [{ name: 'Cat', dimensions: [{ name: 'Dim', options: ['a;b', 'c"d'] }] }];
    expect(parseTacticalConfigCsv(serializeTacticalConfigCsv(tricky))).toEqual(tricky);
  });
});
