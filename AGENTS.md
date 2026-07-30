<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Who this is built for

Field employees on low-end Android phones over 3G/4G, often at a client site
with one bar of signal. **Every kilobyte and every round trip is felt.** An
admin on office wifi is the exception, not the target.

Treat these as requirements, not suggestions. They are cheap to follow while
writing a feature and expensive to retrofit.

## Fetch only what the screen needs

- **`select` the columns, don't `include` the table.** `include: { branches: true }`
  quietly ships every field of every row. Name the fields you render.
- **Never send a nested list that scales with two things at once.** Every
  client × every branch was 295 KB on a 20-client tenant. Load the child list
  for the *one* parent that's selected, via a server action —
  see `listBranches()` in `app/actions/schedules.ts`.
- **Cap unbounded history.** Anything that grows forever (schedules,
  liquidations, edit logs) needs a `take:` and a date window. Look at
  `SERVICE_HISTORY_LIMIT` in the clients page.
- **Derive on the server, don't ship raw rows to compute in the browser.** If
  the UI only shows a count or a total, send the number.

## Split the bundle at every tap

- **Dialogs, sheets, tables and charts load on demand:**
  ```tsx
  const HeavyThing = dynamic(() => import("./heavy").then((m) => m.HeavyThing))
  ```
- **Render them only once open** — `{open && <HeavyThing … />}`. A lazy
  component that is always mounted downloads its chunk on first paint and the
  `dynamic()` bought you nothing. This is the mistake to watch for.
- **Keep shared types out of heavy modules.** If a light component imports a
  type from a heavy one, the heavy chunk comes with it. That's why
  `schedule-slot.ts` and `client-choice.ts` exist.
- Only the default view ships eagerly. On the schedules page that's the month
  grid; week, day, list, the detail sheet and the create dialog are all lazy.

## Shrink images before they leave the phone

- **Always route user uploads through `compressImage()`** (`lib/compress-image.ts`).
  A phone receipt is 3–8 MB; resized to 1600px at q0.72 it's ~200–400 KB. On 3G
  that is the difference between a minute of waiting and a few seconds.
- Upload browser → storage with a presigned URL. Never post a file through a
  server action — it has a small body limit and doubles the transfer.
- Show the saving (`4.2 MB → 310 KB`) so the data cost is visible to the person
  paying for it.

## Don't re-render, don't re-fetch

- **Derive state, don't store it.** A value computable from props or existing
  state should be computed, not `useState` + `useEffect`. The branch loader
  derives both the list and its loading flag from one cache object — no
  synchronous `setState` in an effect, which the lint rule also enforces.
- **Cache per key in state, keyed by id**, so revisiting a selection is free.
- `useMemo` anything O(n) feeding a child: filtered lists, option arrays,
  grouped calendars. Give empty arrays a module-level constant (`NO_BRANCHES`)
  so the identity is stable.
- Mutations call `revalidatePath()` on every affected route. Don't refetch by
  hand and don't poll.

## Keep it responsive

- Mobile-first: tap targets ≥ 32px, `min-w-0` + `truncate` on flex children,
  wide tables in `overflow-x-auto`, never let the body scroll sideways.
- Prefer CSS to JavaScript for layout that changes with width.

## Before calling a feature done

Measure it rather than assuming. Fetch the page with a session cookie and check
the payload, and confirm a realistic amount of data doesn't blow it up:

```
# add N child rows, re-measure, delete them again
```

If a page grows by more than a few KB per extra record, the query is wrong.
