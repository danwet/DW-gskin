/**
 * Desktop notifications through the browser, so macOS shows new mail in
 * Notification Center even when the window is minimised.
 */
const KEY = "dw-desktop-notify-v1";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export function wantedOnThisDevice(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setWantedOnThisDevice(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the setting simply does not stick.
  }
}

/** Asks the browser for permission; macOS then lists the site under Notifications. */
export async function enableNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") {
    setWantedOnThisDevice(true);
    return "granted";
  }
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  if (result === "granted") setWantedOnThisDevice(true);
  return result;
}

export function showMailNotification(input: {
  from: string;
  subject: string;
  count: number;
}): void {
  if (!notificationsSupported() || Notification.permission !== "granted" || !wantedOnThisDevice()) return;
  const title = input.count > 1 ? `${input.count} nieuwe berichten` : `Nieuw bericht van ${input.from}`;
  const body = input.count > 1 ? "Open het dashboard om ze te bekijken." : input.subject;
  try {
    const notification = new Notification(title, {
      body,
      tag: "dw-new-mail",
      // Re-use one entry in Notification Center instead of stacking.
      renotify: true,
      silent: false,
    } as NotificationOptions);
    notification.onclick = () => {
      window.focus();
      window.location.assign("/");
      notification.close();
    };
  } catch {
    // Some browsers require a service worker; then nothing shows.
  }
}
