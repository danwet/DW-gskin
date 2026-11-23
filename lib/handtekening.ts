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
    // Lege blokken en rijen losse <br> onderaan zorgen voor een vel dat meters
    // hoog wordt; die halen we weg.
    .replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/(<br\s*\/?>\s*)+$/gi, "")
    .trim();
}
