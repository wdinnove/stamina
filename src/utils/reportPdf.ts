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

export async function exportPagesToPdf(pages: HTMLElement[], filename: string): Promise<void> {
  if (pages.length === 0) throw new Error('Rien à exporter.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  for (const [i, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      // Une capture à l'échelle 1 donne un texte visiblement flou une fois remis à la taille
      // d'une page A4 imprimée.
      scale: 2,
      backgroundColor: '#FFFFFF',
      logging: false,
      useCORS: true,
    });

    if (i > 0) pdf.addPage();
    // La page DOM ayant déjà le ratio A4, l'image remplit la page bord à bord : les marges
    // du document sont celles du gabarit, pas celles du PDF.
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
  }

  pdf.save(filename);
}

/** `Rapport_SF1_2026-08-24.pdf` — le sujet et la date de génération suffisent à ranger un fichier. */
export function reportFilename(subject: string, generatedOn: string): string {
  const slug = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Rapport_${slug || 'equipe'}_${generatedOn}.pdf`;
}
