const stringTable: { [key: string]: any } = {
  "Open in Finder": { fr: "Ouvrir dans le Finder" },
  "Icon Size": { fr: "Taille des Icones" },
  Undo: { fr: "Annuler" },
  Browser: { fr: "Navigateur" },
  "Export Favorites": { fr: "Exporter les meilleures photos" },
  "View starred only": { fr: "Seulement les meilleures photos" },
  "View videos only": { fr: "Seulement les videos" },
  "Export to folder": { fr: "Exporter..." },
  Duplicate: { fr: "Dupliquer" },
  "Move to new Album": { fr: "Déplacer vers un nouvel album..." },
  Rotate: { fr: "Rotation" },
  Composition: { fr: "Composition" },
  Delete: { fr: "Effacer" },
  "Move $1 files to $2...": { fr: "Déplacer $1 fichier vers $2..." },
  "Rename album $1 to $2": { fr: "Renommer l'album de $1 vers $2..." },
  File: { fr: "Fichier" },
  Map: { fr: "Plan" },
  Metadata: { fr: "Données" },
  "Delete Album": { fr: "Effacer l'album" },
  "Edit Album Name": { fr: "Modifier le nom de l'album" },
  Crop: { fr: "Rogner" },
  Tilt: { fr: "Pencher" },
  Autocolor: { fr: "Couleur auto" },
  Greyscale: { fr: "Noir et blanc" },
  Contrast: { fr: "Contraste" },
  Brightness: { fr: "Luminosité" },
  Sepia: { fr: "Sépia" },
  Polaroid: { fr: "Polaroid" },
  Flip: { fr: "Inverser" },
  Mirror: { fr: "Miroir" },
  Blur: { fr: "Flou" },
  Sharpen: { fr: "Piqué" },
  "Extra Light": { fr: "Lumiere d'appoint" },
  "Original Date": { fr: "Date de l'original" },
  "Width (pixels)": { fr: "Largeur (pixels)" },
  "Height (pixels)": { fr: "Hauteur (pixels)" },
  Make: { fr: "Marque" },
  Model: { fr: "Modele" },
  ISO: { fr: "ISO" },
  "Exposure Time": { fr: "Temps d'exposition" },
  "F-Number": { fr: "Ouverture (F-Number)" },
  "Sort by Name": {fr:"Trier par nom"},
"Sort by Date": {fr:"Trier par date"},
"Reverse Sort": {fr:"Inverser le tri"},
};
const lang = window.navigator.language.split("-")[0];
let str = new Set<string>();
export function t(s: string) {
  const elements = s.split("|");
  let res = stringTable[elements[0]]?.[lang];
  if (!res) {
    if(lang !== "en") {
      str.add(`"${s}": {fr:"${s}"},`);
      console.log('Missing strings', Array.from(str).join('\n'));
    }
    res = elements[0];
  }
  elements.slice(1).forEach((v, idx) => (res = res.replace(`$${idx + 1}`, v)));
  return res;
}
