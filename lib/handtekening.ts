/**
 * Handtekeningen uit een mailclient bevatten soms stukjes die geen geldige HTML
 * zijn (zoals een losse `<style=font-size: 14px;="">`) of scripts. Die halen we
 * eruit voordat we de handtekening tonen of versturen.
 */
export function opschonenHandtekening(html: string): string {
  if (!html.trim()) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Een kapotte tag als <style=font-size: 14px;=""> is geen element.
    .replace(/<style=[^>]*>/gi, "")
    .replace(/<\/style=[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    // Alleen écht lege blokken gaan weg. <br>-regels blijven staan: die geven
    // de optische ruimte tussen twee mails en zijn dus de bedoeling.
    .replace(/<div[^>]*>(\s|&nbsp;)*<\/div>/gi, "")
    .trim();
}
