# Werkafspraken

## Geen aannames over data

Een bewering over wat de app doet, wat er in de opslag staat of wat een scherm
toont, is pas iets waard als je het hebt gezien. Dus:

- **Opslag**: lees de echte rij voordat je iets over de inhoud zegt. Een lege
  string is niet hetzelfde als `null`, en een kolom die je verwacht kan leeg zijn.
- **API**: haal het endpoint op met een sessiecookie en lees het antwoord, in
  plaats van te redeneren wat het zou teruggeven.
- **Scherm**: meet in de browser (afmetingen, klassen, tekst) voordat je zegt dat
  iets verschoven, zichtbaar of weg is.
- **Gedrag**: als iets pas op de server werkt (Gmail-token, cron), zeg dat erbij
  en verzin geen resultaat dat je lokaal niet kunt bevestigen.

Bij twijfel: eerst kijken, dan pas beweren. En als iets niet getest is, dat
letterlijk zeggen in plaats van het als opgelost te brengen.

## Verder

- Niet pushen zonder dat de gebruiker "push" zegt.
- Niet na elke bewerking een build met commit draaien; de gebruiker bepaalt dat.
- De dev-server niet herstarten tenzij hij vastloopt.
