# How the attendance selfie and coordinates work

Written because the first reaction to timing in on a laptop is reasonably *"how
does it know where I am — I never gave it GPS?"*

Both the photograph and the position come from the browser, through two web APIs
that only work with the user's explicit permission and only on a secure (HTTPS)
connection. Neither one reaches into the machine on its own, and neither is
something this application could do by itself.

---

## 1. The coordinates

### There is no GPS involved on a laptop

The browser API is called **Geolocation**, not "GPS". GPS is only one of the
things it can use, and most laptops have no GPS receiver at all. What the API
actually promises is *"a position, from the best source available"* — and it
picks from three, in descending order of quality:

| Source | How it works | Typical accuracy |
|---|---|---|
| **GNSS / GPS** | The device's radio hears four or more satellites and solves for its own position by timing them | ±5–20 m |
| **Wi-Fi positioning** | The device lists the Wi-Fi networks it can *see* and asks a lookup service where those networks are | ±20–150 m |
| **IP address** | The address block is traced to whoever owns it | ±1–50 km |

On a laptop indoors, it is almost always the middle one. That is why the reading
surprised you by being close.

### Wi-Fi positioning, in detail

This is the part that feels like magic, so it's worth spelling out.

1. Your laptop's Wi-Fi adapter is constantly aware of every access point in
   range — not just the one you're connected to. Your neighbour's router, the
   café downstairs, the printer's hotspot. Each broadcasts a **BSSID**, a unique
   hardware address, along with a signal strength.
2. When a page asks for a position, the browser collects that list — say fifteen
   BSSIDs and how strongly each is heard — and sends it to a **location
   provider** over the internet. Which provider depends on the browser: Chrome
   and Edge use Google's, Safari uses Apple's, and Windows may answer from its
   own location service.
3. That provider holds a vast database mapping BSSIDs to physical locations,
   built by driving cars down streets recording what they heard where, and by
   phones that already knew their GPS position reporting the networks around
   them.
4. Looking up your fifteen networks gives fifteen known points. Their signal
   strengths say roughly how far you are from each. Overlapping those distances
   narrows you to a small area — the same trick as GPS, using routers instead of
   satellites.

**The upshot:** accuracy depends on how many mapped networks are near you, not
on your hardware. A laptop in a dense office block can land within 20 metres. The
same laptop in a rural area with one router might be off by a kilometre, or fall
back to the IP address and be off by fifty.

### Why we record the accuracy number

Every position comes with an `accuracy` value in metres. It is a radius: the
standard defines it as the circle around the reported point within which you
have a **95% chance** of actually being.

This matters more than the coordinates themselves. `14.5995, 120.9842` looks
equally authoritative whether it came from a satellite or from a guess at your
internet provider's exchange. The accuracy figure is what tells them apart:

- **±8 m** — someone standing at the site.
- **±150 m** — somewhere in the right block.
- **±12,000 m** — the browser found nothing and fell back to the IP address.
  This is not evidence of attendance.

So the system stores it alongside the position, shows it to the employee at
punch time (`±42 m`), and warns when it exceeds 200 metres — *"rough — step
outside if you can"* — because stepping outside usually finds real satellites or
more networks.

### What the permission prompt actually covers

One prompt, one permission: *location*. It does not distinguish between GPS,
Wi-Fi and IP, because from the page's point of view they are the same call. Two
consequences:

- You will not see a separate "allow GPS" prompt. There isn't one.
- Browsers **remember the answer per site**. If you allowed it once, later visits
  don't ask again — which is the usual reason it seems to work without being
  granted. In Chrome: the icon to the left of the address bar → Permissions.

If permission is refused, `getCurrentPosition` fails immediately, the sheet says
so, and the Time in button stays disabled. There is no second attempt by another
route: this server never looks up an IP address to guess a location.

### What leaves your machine

Worth being precise, because "it sends my Wi-Fi networks to Google" deserves a
straight answer:

- **To the location provider** (Google/Apple/Microsoft, not us): the list of
  nearby network identifiers. This is the browser doing it, under its own privacy
  policy, for every site that asks — not something this application controls or
  can see.
- **To this system**: only the final result — latitude, longitude, accuracy.
  Nothing about which networks you can see, and no continuous tracking. The
  position is read **once**, at the moment you punch, and never in the
  background.

---

## 2. The camera

### Why it can't be an upload

The requirement was a selfie taken *now*, not a file chosen from a gallery. Those
are two entirely different browser mechanisms:

- `<input type="file">` — opens a file picker. The bytes come from storage. A
  photo from last week is indistinguishable from one taken this second.
- **`getUserMedia`** — opens the camera *device* and hands the page a live video
  stream. There is no file, no picker, and no way to point it at an existing
  image.

The attendance capture uses the second. The sequence:

1. `navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })` asks
   for the front camera. The browser shows its permission prompt.
2. On approval it returns a **MediaStream** — a live feed, not a picture. That
   stream is attached to a `<video>` element, which is the preview you see.
3. Pressing the shutter draws the video's *current frame* onto an off-screen
   `<canvas>`, which is then encoded to a JPEG.
4. That JPEG is compressed and uploaded, and the camera is switched off.

Because the pixels come from a live stream that the browser only grants after an
explicit prompt, the photo is necessarily of whatever the camera was pointed at
in that moment.

### Two details you may notice

**The preview is mirrored, the saved photo isn't.** People expect a front camera
to behave like a mirror — raise your left hand, the left side of the image moves.
But the stored photograph should be what the camera actually saw, so text on a
uniform or an ID card reads correctly. The preview is flipped in CSS only; the
canvas draws the true frame.

**The camera light goes out when you're done.** A `MediaStream` keeps the device
open until every track is explicitly stopped. The component stops them when you
capture, when you close the sheet, and — importantly — if the sheet is closed
*while the camera is still starting up*, which otherwise leaves the light on
until the tab is closed.

---

## 3. Why both need HTTPS

Camera and location are **secure-context APIs**. In a page served over plain
`http://`, `navigator.mediaDevices` and `navigator.geolocation` are not merely
blocked — they do not exist. The browser removes them.

The exception is `localhost`, which is treated as secure. That is why this works
on the development machine and fails on a phone opening `http://192.168.x.x`.

The reason is straightforward: on an unencrypted connection, anyone on the same
network can read the traffic and alter the page. Handing a camera feed and a home
address to a page that can be tampered with in transit is not a risk browsers are
willing to take, so the capability is withheld rather than guarded.

**Consequence for deployment:** attendance cannot be used over a plain-HTTP LAN
address. The system has to be served over HTTPS for employees to time in from
their phones.

---

## 4. What this proves, and what it doesn't

Worth stating plainly, because a photo and a map pin look more conclusive than
they are.

**What it establishes:** at a recorded time, someone holding this account's
logged-in session took a photograph with the device's camera and reported a
position. Together those make casual dishonesty awkward — you cannot punch in
from home in your pyjamas without a photograph of yourself at home.

**What it does not establish:**

- **Location can be falsified.** Browser developer tools can override the
  reported position in a few clicks, and phones can run mock-location apps. The
  coordinates are a claim by the device, not an independent observation.
- **A camera can be virtual.** Software like OBS registers a virtual camera that
  feeds a video file or a still image, and `getUserMedia` cannot tell it from a
  real sensor. Photographing a printed photo works too.
- **A fresh photo is not necessarily a fresh face.** The system knows the frame
  came from the camera at that moment; it does not know who was in front of it.

This is a deterrent and an audit trail, not proof. It is the same standing as a
signed timesheet: good enough that inventing one takes deliberate effort and
leaves evidence, not good enough to be treated as incontestable. If a punch is
ever disputed, the useful signals are the **accuracy figure** (was it a real
fix?) and whether the photograph and position agree with the day's scheduled
site.

---

## 5. Where this lives in the code

| Concern | File |
|---|---|
| Live camera, capture, cleanup | [`components/attendance/selfie-capture.tsx`](../components/attendance/selfie-capture.tsx) |
| Position request, upload, punch submission | [`components/attendance/punch-dialog.tsx`](../components/attendance/punch-dialog.tsx) |
| Detecting a missing capability at render | [`lib/use-browser-capability.ts`](../lib/use-browser-capability.ts) |
| Accuracy threshold, overtime window, formatting | [`lib/attendance.ts`](../lib/attendance.ts) |
| Server-side write and validation | [`app/actions/attendance.ts`](../app/actions/attendance.ts) |
| `Attendance` / `OvertimeRequest` tables | [`prisma/schema.prisma`](../prisma/schema.prisma) |
