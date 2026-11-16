# T-Lab Papers

T-Lab Papers is a dashboard for the lab's Paper Tracker Google Sheet:
https://tyrrelllab.github.io/paper-tracker/

- Search titles, journals and notes, and search by author.
- Filter by topic tags (Aging, Atherosclerosis, Vascular Biology, Cardiac, Brain,
  Liver, Mitochondria, Immunology, Methods) and by model (Human, Mouse).
- Edit a paper's tags (turn standard tags on or off, or add your own). The
  change is saved to the Tags column of the sheet.
- Add a note to a paper. The note goes into the Notes column of the sheet with
  your name and the date.

## How it works

The site is static (no build step). `app.js` calls a Google Apps Script web app
(URL in `config.js`) that reads and writes the sheet. The script asks for the lab
passcode on each request, so the list and the notes are not public. The passcode
is not in this repo. Ask Dan for it.

The Apps Script source is in the `paper_scraper` repo (`apps_script/Code.gs`).

## Run it on your computer

```bash
python3 -m http.server 4188
```

Then open http://localhost:4188/.
