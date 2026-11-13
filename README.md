# WattWise Pune

Understand your own MSEDCL bills without energy jargon. The app starts with your name and a home, asks you to upload and verify real bills, then helps record your devices through a conversation. There are no demo homes or preloaded bills.

## Run and validate

```bash
npm install
npm run dev
npm test
npm run build
npm run lint
```

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Your homes and bills

- Each local user profile has its own independent homes, bills, devices, and chats. Use **Sign out** in the sidebar or **Profile** on mobile to return to the profile chooser. Create another profile or reopen an existing one; signing out never deletes the saved data.
- Existing single-user workspaces migrate automatically into a saved profile. The old v2 storage snapshot is retained; the new profile list is stored under `wattwise-profiles-v3`. A corrupt new profile list is reported instead of silently falling back to old data.
- Add multiple homes under one personal workspace. Bills, device lists, and conversations are independent for each home.
- Click the home name in the header to return to that home's insights. This shortcut is disabled until setup is complete and while bill uploads are being read or reviewed.
- Choose the printed **Bill language** (English, Marathi, or Hindi), then upload up to 10 PDF/JPG/PNG bills at once (15 MB per file). For mixed-language batches, upload each language separately. English labels are recognized alongside the selected language. This lightweight mode maps supported field labels and month names to one common review form; it does not require AI translation or promise recognition of every language.
- Extraction happens in-browser. Photos and scanned PDF pages use the selected OCR language, image enlargement/contrast correction, and MSEDCL table-aware numeric reading. OCR language assets are downloaded on first use; bill images are not uploaded.
- Check every extracted bill before saving. Unreadable fields stay blank; no bill amounts, dates, or history are invented. English/Marathi/Hindi bill months, consumer labels, phase and regular payable amount are supported. When billing days are not printed, the app calculates the interval between the current and previous meter-reading dates and asks you to verify it.
- Early-payment discounts and late-payment amounts are not the regular bill amount or fixed charges. If the fixed-charge breakdown is absent (for example on a first-page-only bill), leave that optional field blank or upload the breakdown page.
- Comparisons use actual saved bill amounts and units, with daily usage to account for unequal billing days. One bill per month is supported for each home. Different consumer numbers must go into different homes.
- Names, bill details, consumer numbers, devices, and conversations are saved in browser local storage. Raw files are not retained. This is not authentication or cloud sync: anyone using the same browser profile can access the workspace. Use your own device; clearing site data removes it.

## Generation-water insight

The selected bill includes a freshwater equivalent using its actual kWh and WRI's estimated **2.2 m³/MWh (2.2 litres/kWh)** consumption intensity for India's thermal-power portfolio in **2016**. Source: [Parched Power (WRI, 2018), p. 16](https://files.wri.org/d8/s3fs-public/parched-power-india.pdf).

This is a historical thermal-power benchmark for scale, **not** measured household water use, a current Maharashtra grid average, or water withdrawn by power plants. The current generation mix, cooling technology, and transmission/distribution losses are not known from a residential bill. Do not present the value as the actual water consumed to supply that home.

## Conversational assistant

Two clearly labeled modes are available:

1. **Guided chat:** instant, lightweight conversation for recording devices and moving through cooling, hot water, kitchen/laundry, and other loads. This is not generative AI.
2. **Private browser AI:** select **Enable private AI** to load WebLLM's `Qwen2.5-0.5B-Instruct-q4f32_1-MLC` model in a worker. It needs a compatible WebGPU browser/GPU, approximately 1 GB GPU memory, and an initial model download of several hundred MB. Model assets are fetched from WebLLM's public model hosts and cached by the browser. Model downloads do not send prompts. No API key, Ollama installation, AI provider calls, or AI backend are required.

The AI produces schema-validated device suggestions; the user must confirm power, quantity, schedule, and relevant AC/geyser settings before devices enter the inventory. Model/load/generation errors are shown explicitly. Unsupported devices can still choose guided chat. AI releases GPU resources when leaving the assistant; switching homes may reload the cached model. Model answers are not a source of tariff or hardware facts.

For geysers, time spent heating is separate from being left switched on between uses. “Left on all day” selects standby but leaves heating hours for you to confirm; it does not assume 24 hours of continuous heating.

## Publishing

Build with `npm run build` and publish `dist` to any static HTTPS host (for example GitHub Pages, Cloudflare Pages, or a static hosting service). Serve JavaScript workers with correct MIME types. HTTPS is needed for WebGPU outside localhost; network access to the public model and OCR language asset hosts is needed on first use. Review model licenses and browser/device compatibility before release.

No application API/server secrets are required. There are no per-conversation API charges, but ordinary static hosting/bandwidth costs and the visitor's model-download data costs still apply. Browser AI is optional: the rest of the site must remain usable if model hosts are unavailable or the visitor declines the download.

## Estimates, not guaranteed savings

Uploaded amounts and units are preserved as the baseline. Device physics use user-confirmed schedules and indicative catalog/generic power values; those are not exact meter measurements. Savings are deterministic differences across illustrative tariff buckets, wheeling, FAC and 16% duty, respecting the bill's actual billing days. Combined simulation savings are calculated together rather than adding overlapping recommendations.

If modeled device usage exceeds the uploaded meter usage by more than 20%, the recommended next step is to correct the inventory and schedules; quantified savings recommendations are withheld until then.

The tariff values and model catalog have not been verified against the latest MERC orders or manufacturer/BEE database. Do not present projections as exact future bills. Arrears, credits, tariff changes, weather, and appliance duty cycles can affect actual bills. Missing device coverage is not evidence of phantom loads or hardware degradation.
