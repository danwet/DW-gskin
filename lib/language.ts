export type MailLanguage = "en" | "nl" | "de" | "fr";

const WORDS: Record<MailLanguage, string[]> = {
  nl: [
    "donderdag",
    "bevestigen",
    "bevestiging",
    "goedkeuring",
    "afspreken",
    "bespreking",
    "notities",
    "graag",
    "jouw",
    "kunt",
    "kun",
    "zonder",
    "nodig",
    "voor",
    "niet",
    "het",
    "een",
    "nog",
    "dat",
    "past",
  ],
  de: [
    "donnerstag",
    "reihenfolge",
    "vergleich",
    "festlegen",
    "live-test",
    "kommen",
    "soll",
    "muss",
    "bitte",
    "oder",
    "nach",
    "abend",
    "heute",
    "frage",
    "einen",
    "nicht",
    "für",
    "fuer",
    "und",
    "der",
    "die",
    "das",
    "ich",
    "dem",
    "den",
    "vor",
  ],
  fr: [
    "jeudi",
    "bonjour",
    "merci",
    "pouvez",
    "vous",
    "pour",
    "une",
    "avec",
    "les",
    "des",
    "est",
  ],
  en: [
    "thursday",
    "confirm",
    "approval",
    "should",
    "before",
    "after",
    "please",
    "question",
    "the",
    "and",
    "you",
    "your",
    "can",
    "with",
    "this",
    "that",
    "need",
    "from",
  ],
};

function score(text: string, words: string[]): number {
  const pattern = new RegExp(`\\b(?:${words.join("|")})\\b`, "gi");
  return text.match(pattern)?.length ?? 0;
}

export function detectLanguage(text: string): MailLanguage {
  const scores = {
    nl: score(text, WORDS.nl),
    de: score(text, WORDS.de),
    fr: score(text, WORDS.fr),
    en: score(text, WORDS.en),
  };
  const ranked = (Object.entries(scores) as [MailLanguage, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] === 0) return "en";
  return ranked[0][0];
}
