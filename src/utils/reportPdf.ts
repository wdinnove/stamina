/**
 * Export du rapport en PDF A4.
 *
 * Chaque page du document est un élément DOM déjà au format A4 : on capture page par page, et
 * chaque capture devient une page du PDF telle quelle. C'est ce qui garantit qu'aucun tableau
 * n'est coupé en deux — le découpage est décidé par la mise en page, pas par un algorithme de
 * tranches qui ignore le contenu.
 *
 * jsPDF et html2canvas pèsent ~600 ko à eux deux : ils sont chargés au clic sur « Générer »,
 * pas à l'ouverture de la page — la plupart des visites la consultent sans rien exporter.
 */

const A4_WIDTH_MM  = 210;
const A4_HEIGHT_MM = 297;

export async function exportPagesToPdf(
  pages: HTMLElement[],
  filename: string,
  /** Appelé avant chaque page — un rapport couvrant tout l'effectif peut en compter cinquante,
   *  et une attente d'une minute sans retour ressemble à un plantage. */
  onProgress?: (done: number, total: number) => void,
  /** Portrait pour un rapport (texte, blocs empilés) ; paysage pour un tableau large — un
   *  boxscore à vingt colonnes tassé en portrait devient illisible avant d'être imprimable. */
  orientation: 'portrait' | 'landscape' = 'portrait',
): Promise<void> {
  if (pages.length === 0) throw new Error('Rien à exporter.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const widthMm  = orientation === 'landscape' ? A4_HEIGHT_MM : A4_WIDTH_MM;
  const heightMm = orientation === 'landscape' ? A4_WIDTH_MM  : A4_HEIGHT_MM;

  for (const [i, page] of pages.entries()) {
    onProgress?.(i, pages.length);
    const canvas = await html2canvas(page, {
      // Une capture à l'échelle 1 donne un texte visiblement flou une fois remis à la taille
      // d'une page A4 imprimée.
      scale: 2,
      backgroundColor: '#FFFFFF',
      logging: false,
      useCORS: true,
    });

    if (i > 0) pdf.addPage();
    // La page DOM ayant déjà le ratio A4 (portrait ou paysage), l'image remplit la page bord à
    // bord : les marges du document sont celles du gabarit, pas celles du PDF.
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, widthMm, heightMm);
  }

  onProgress?.(pages.length, pages.length);
  pdf.save(filename);
}

function slugify(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** `Rapport_SF1_2026-08-24.pdf` — le sujet et la date de génération suffisent à ranger un fichier. */
export function reportFilename(subject: string, generatedOn: string): string {
  return `Rapport_${slugify(subject) || 'equipe'}_${generatedOn}.pdf`;
}

/** `Boxscore_ASVEL_2026-08-24.pdf` — l'adversaire et la date du MATCH, pas celle de génération :
 *  c'est ce qu'on cherche en retrouvant le fichier des mois plus tard. */
export function boxscoreFilename(opponent: string, matchDate: string): string {
  return `Boxscore_${slugify(opponent) || 'adversaire'}_${matchDate}.pdf`;
}
