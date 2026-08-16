// ---------------------------------------------------------------------------
// The service worker, for notifications and nothing else
// ---------------------------------------------------------------------------
//
// Deliberately not a caching layer. `next-pwa` sits unconfigured in this
// project's dependencies and is a webpack-era plugin that the Turbopack build
// would never run anyway; offline support is its own decision with its own
// risks — a field employee served a stale schedule from a cache is worse off
// than one told the network is down. This file exists so a push can arrive
// when the app is closed, and it does that one job.
//
// Plain JavaScript, served from /public as-is: a service worker is fetched by
// the browser rather than imported by the app, so it is not part of any bundle
// and has no build step.

// Take over as soon as it is installed rather than waiting for every tab using
// the old copy to close. A notification worker has no cached assets to keep
// consistent, so there is nothing to be careful about.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
)

self.addEventListener("push", (event) => {
  // A push with no payload still means *something* happened, so it is worth
  // showing — a browser that drops the body is better answered with a vague
  // notification than with silence.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || "AeroCoole"
  const options = {
    body: payload.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    // Opening the notification should land on the thing it is about.
    data: { href: payload.href || "/" },
    // Same tag replaces rather than stacks: five schedule changes in a minute
    // should be one line in the shade, not five.
    tag: payload.tag || "aerocoole",
    renotify: Boolean(payload.tag),
    timestamp: Date.now(),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const href = (event.notification.data && event.notification.data.href) || "/"

  // Focus a tab that is already open rather than piling up new ones, and only
  // open a window if the app is not running at all.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(href)
            return client.focus()
          }
        }
        return self.clients.openWindow(href)
      })
  )
})
