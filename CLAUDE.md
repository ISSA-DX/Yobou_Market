# Working on Yobou Market

## Project memory comes first

`PROJECT_MEMORY.md` is this project's long-term memory: every change
pushed so far and the plan (`NS-` next steps).

**At the start of any session:** read `PROJECT_MEMORY.md` in full. The
open plan is every `NS-` item whose latest status (in the newest entry
that mentions it) is not `done` or `dropped`.

**When asked to continue, or to "run the memory":**
1. Pick the highest-priority open step (P0 before P1 …; within a
   priority, the order recommended in the newest entry). Confirm with the
   owner before steps that cost money, need accounts or keys, or touch
   production data.
2. Implement it on a new branch, test it, and verify it.
3. Commit, push and open a pull request (the owner merges).
4. Append a new entry to `PROJECT_MEMORY.md`, then commit and push it on
   the same branch.

**After every push, append an entry** using the format at the top of
`PROJECT_MEMORY.md`:
- Numbered one higher than the last entry.
- Record what changed, why, the key files, how it was verified (state
  plainly what was not tested), the status of earlier next steps, and
  any new next steps with fresh `NS-` numbers.
- **Never edit or delete existing lines**, not even to tick a box or fix
  a typo. Corrections go in a new entry. CI
  (`.github/workflows/memory-guard.yml`) rejects any removed or changed
  line.

## Repository facts
- Front-ends:
  - `APP_shopper_and_buyer`: customer app, also the Android app source.
  - `Web_Version_APP`: browser build of the same source.
  - `Internal_Web_Admin`: admin portal at `/admin/`.
  - `Partner_Web_Vendor`: seller portal at `/partner/`, plus its own
    Android app.
- API: `server` (Express, Prisma, SQLite). Tests: `npm test` in `server`.
- Never commit `scripts/`, `.env`, `cookies.txt`, or CRLF-only
  `gradlew.bat` changes.
- `APP_shopper_and_buyer/src/styles/motion.css` is protected; don't edit
  it.
- Node runs on Windows. From WSL, use
  `cmd.exe /c "cd /d C:\Users\issak\OneDrive\Desktop\Yobou\<dir> && …"`.
