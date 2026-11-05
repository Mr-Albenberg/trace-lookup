# Trace Lookup — data backend

The Trace Lookup page is static, so on its own it can't fetch a person's **home
address or phone number** — that data only comes from paid people-search
providers, and they don't allow calls directly from a web page.

This folder is a tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/)
that bridges the gap. It holds your API credentials (as encrypted secrets),
calls the provider, and returns the result to the page. The page then shows
addresses, phones, emails and relatives inline — and auto-looks-up any real name
it discovers from a username or email search.

```
Trace Lookup page  ──►  your Worker (holds the keys)  ──►  Endato / EnformionGO  ──►  back as cards
```

## 1. Get a data provider account

Sign up at **[Endato / EnformionGO](https://endato.com/)** (Endato rebranded to
EnformionGO; either signup lands on the same Galaxy API). In the dashboard,
create an **API Access Profile** — you'll get an **AP name** and **AP password**.
Billing is per successful match; check their pricing page for current rates.

> You can use any provider on the same "Galaxy" API. If your base URL or endpoint
> paths differ, change the constants at the top of `worker.js` and `GALAXY_BASE`
> in `wrangler.toml`.

## 2. Deploy the Worker

You need [Node.js](https://nodejs.org/) and a (free) Cloudflare account.

```bash
npm install -g wrangler
wrangler login

cd api
wrangler secret put GALAXY_AP_NAME        # paste your AP name
wrangler secret put GALAXY_AP_PASSWORD    # paste your AP password
wrangler deploy
```

`wrangler deploy` prints a URL like
`https://trace-lookup-api.<your-subdomain>.workers.dev`.

If your account is a **legacy Endato** account (not EnformionGO), uncomment and
set `GALAXY_BASE = "https://devapi.endato.com"` in `wrangler.toml`, then redeploy.

## 3. Connect the page

Open the Trace Lookup site, click **Data backend** (top right), paste the Worker
URL, and hit **Save & test**. A green dot means it's connected. The URL is stored
in your browser only.

Now a **name** or **phone** search shows real records, and username/email
searches auto-run a people lookup on any real name they turn up.

## 4. Lock it down (recommended)

Once it works, restrict the Worker to your page's origin so nobody else can spend
your API credits: set `ALLOW_ORIGIN` in `wrangler.toml` (e.g.
`https://mr-albenberg.github.io`) and `wrangler deploy` again.

## Endpoints

| Method | Path      | Body                                             | Provider call |
|--------|-----------|--------------------------------------------------|---------------|
| GET    | `/ping`   | —                                                | health check  |
| POST   | `/person` | `{ first, last, middle?, city?, state?, dob? }`  | PersonSearch  |
| POST   | `/phone`  | `{ phone }`                                      | Caller ID     |

`/person` accepts `"type": "Teaser"` for a cheaper, partially-masked preview
instead of the full (billed) `Person` search.

## Costs & rules

- You pay the **provider** per match; the Worker itself runs free on Cloudflare's
  tier for this volume.
- Providers require you to attest you won't use the data for **employment,
  tenant, credit or insurance** decisions (US FCRA). Checking your own footprint
  is the intended use.

## If results don't render

The page parses the documented Galaxy response shape (`Addresses`,
`PhoneNumbers`, `EmailAddresses`, `RelativesSummary`). If your provider returns
different field names, tweak `normPersons()` in `index.html` — it's written to be
easy to adjust.
