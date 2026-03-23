# vaibhav-live

Public earnings dashboard for the $50K challenge.

**Live at:** `https://vaibhavos.github.io/vaibhav-live`

## How it works

1. `data.json` — the single source of truth. Updated by the local dashboard via GitHub API.
2. `index.html` — reads `data.json` and renders the public page. No framework. No build step.
3. GitHub Actions deploys automatically on every push to `main`.

## Setup

1. Create a new GitHub repo named `vaibhav-live`
2. Push this folder's contents
3. Go to repo Settings → Pages → Source: GitHub Actions
4. Done — your page is live at `username.github.io/vaibhav-live`

## Custom domain (optional)

To use a custom subdomain like `live.vaibhav.com`:
1. Add a `CNAME` file in this repo containing `live.vaibhav.com`
2. Point the DNS CNAME record to `username.github.io`
3. Set the custom domain in repo Settings → Pages

## Updating data

From the local dashboard:
1. Click the "push to github ↑" button (top right)
2. First time: click the ⚙ icon and enter your GitHub username, repo name, and a personal access token
3. Every push commits `data.json` with a changelog message and triggers a GitHub Pages rebuild

Data updates go live within ~60 seconds of pushing.

## Privacy

The public page shows:
- Index OS, Ghost Protocol, OpenGOAT — by name
- Quant products — aggregated (not broken down by individual tool)
- Content engine — aggregated (not broken down by campaign or page)
- Capital — aggregated (not broken down by firm or account)

No affiliate details, no campaign RPM, no individual page performance is exposed.
