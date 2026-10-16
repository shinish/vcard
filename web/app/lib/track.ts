/** Reports what someone did with a card. Fire-and-forget: the navigation
 *  must not wait for it, and a blocked request must not break the link. */
export function track(publicId: string, kind: string) {
  try {
    const body = JSON.stringify({ kind });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `/api/public/${publicId}/event`,
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch(`/api/public/${publicId}/event`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  } catch {
    // analytics are never worth an error in front of a visitor
  }
}
