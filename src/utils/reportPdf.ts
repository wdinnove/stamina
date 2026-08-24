/**
 * Transforme un bloc de la page en PDF A4 portrait téléchargé.
 *
 * Le rapport est composé comme du HTML normal (les mêmes composants que les pages d'analyse),
 * capturé en image, puis découpé en pages. Pas de moteur de rendu séparé : ce qui est à l'écran
 * est ce qui est dans le PDF, donc aucune mise en page à maintenir en double.
 *
 * `scale: 2` compense le fait qu'une capture à l'échelle 1 donne un texte visiblement flou une
 * fois remis à la largeur d'une page A4.
 *
 * jsPDF et html2canvas pèsent ~600 ko à eux deux : ils sont chargés au clic sur « Générer »,
 * pas à l'ouverture de la page — la plupart des visites la consultent sans rien exporter.
 */

const A4_WIDTH_MM  = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM    = 10;

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    // Le fond de l'app est sombre et html2canvas rend transparent ce qu'il ne peut pas résoudre :
    // sans fond explicite, les zones vides sortiraient en noir pur dans le PDF.
    backgroundColor: '#0D0F14',
    logging: false,
    useCORS: true,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const contentWidth  = A4_WIDTH_MM  - MARGIN_MM * 2;
  const contentHeight = A4_HEIGHT_MM - MARGIN_MM * 2;

  // Hauteur totale de l'image une fois ramenée à la largeur utile de la page.
  const imgHeight = (canvas.height * contentWidth) / canvas.width;
  // Tranche de l'image (en pixels canvas) qui tient sur une page.
  const sliceHeightPx = (contentHeight * canvas.width) / contentWidth;

  let renderedHeight = 0;
  let page = 0;

  while (renderedHeight < imgHeight) {
    const sourceY = page * sliceHeightPx;
    const remainingPx = canvas.height - sourceY;
    const currentSlicePx = Math.min(sliceHeightPx, remainingPx);

    // Chaque page est une re-découpe du canvas d'origine : dessiner l'image entière décalée
    // déborderait des marges au lieu d'être rognée.
    const slice = document.createElement('canvas');
    slice.width  = canvas.width;
    slice.height = currentSlicePx;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error("Impossible de préparer le PDF (canvas indisponible).");
    ctx.fillStyle = '#0D0F14';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, currentSlicePx, 0, 0, canvas.width, currentSlicePx);

    if (page > 0) pdf.addPage();
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92), 'JPEG',
      MARGIN_MM, MARGIN_MM,
      contentWidth, (currentSlicePx * contentWidth) / canvas.width,
    );

    renderedHeight += (currentSlicePx * contentWidth) / canvas.width;
    page += 1;
  }

  pdf.save(filename);
}

/** `Rapport_SF1_2026-08-24.pdf` — le sujet et la date de génération suffisent à ranger un fichier. */
export function reportFilename(subject: string, generatedOn: string): string {
  const slug = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Rapport_${slug || 'equipe'}_${generatedOn}.pdf`;
}
