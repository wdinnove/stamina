import { sceneAspect } from '../components/DiagramSceneView';
import type { DiagramScene } from './diagram';

/**
 * Rasterisation d'un schéma en PNG.
 *
 * Le SVG affiché à l'écran est sérialisé puis redessiné dans un canvas : l'image produite
 * est donc exactement ce que le coach a sous les yeux, à la résolution d'export près.
 * Elle part ensuite dans le bucket `exercises` comme n'importe quelle image, ce qui rend le
 * schéma visible partout où la galerie l'est déjà (fiche, séance, impression) sans que ces
 * écrans aient à connaître les schémas.
 */

/** Largeur de l'image générée, en pixels — assez pour rester nette à l'impression. */
export const EXPORT_WIDTH = 1600;

function serialize(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('style');
  // Les poignées d'édition sont marquées pour ne jamais se retrouver dans l'image finale.
  clone.querySelectorAll('[data-editor-only]').forEach(node => node.remove());
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Rendu du schéma impossible'));
    img.src = src;
  });
}

export async function sceneToPngBlob(svg: SVGSVGElement, scene: DiagramScene, width = EXPORT_WIDTH): Promise<Blob> {
  const height = Math.round(width / sceneAspect(scene));
  const markup = serialize(svg, width, height);
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup));

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Conversion PNG impossible');
  return blob;
}

export async function sceneToPngFile(svg: SVGSVGElement, scene: DiagramScene): Promise<File> {
  const blob = await sceneToPngBlob(svg, scene);
  return new File([blob], `schema-${scene.court}.png`, { type: 'image/png' });
}
