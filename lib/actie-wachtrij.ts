/**
 * Mailacties mogen niet door elkaar lopen: argeren, verplaatsen naar de
 * prullenbak en terugzetten moeten op volgorde bij Gmail aankomen. Anders kan
 * "terugzetten" de server bereiken voordat de actie die het terugdraait er is,
 * en dan valt er niets terug te draaien.
 *
 * Eén wachtrij voor de hele app, zodat de kaart, de sheet en de undo-knop
 * dezelfde volgorde delen.
 */
let wachtrij: Promise<void> = Promise.resolve();

export function enqueueMailAction<T>(task: () => Promise<T>): Promise<T> {
  const volgende = wachtrij.then(task, task);
  // De wachtrij zelf mag nooit afbreken; de aanroeper ziet de fout wel.
  wachtrij = volgende.then(
    () => undefined,
    () => undefined,
  );
  return volgende;
}
