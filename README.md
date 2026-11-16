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
- No image available? Choose **No image? Enter bill manually**, fill the same review fields, and confirm. No values are prefilled or invented; duplicate-month and consumer-number checks are the same as for uploads.
- Extraction happens in-browser. Photos and scanned PDF pages use the selected OCR language, image enlargement/contrast correction, and MSEDCL table-aware numeric reading. OCR language assets are downloaded on first use; bill images are not uploaded.
- Camera-photo mapping rejects punctuation-only amount candidates and rereads consumer numbers with a digits-only pass. If grid lines hide the total-usage header/value, a bounded total-cell reread requires reading-date and meter-table anchors; it never substitutes current readings, another usage column, or history figures. Unreadable total cells get a local retry that smooths dotted print, thresholds the cell, and removes edge-connected table borders before OCR.
- Check every extracted bill before saving. Unreadable fields stay blank; no bill amounts, dates, or history are invented. English/Marathi/Hindi bill months, consumer labels, phase and regular payable amount are supported. When billing days are not printed, the app calculates the interval between the current and previous meter-reading dates and asks you to verify it.
- Early-payment discounts and late-payment amounts are not the regular bill amount or fixed charges. If the fixed-charge breakdown is absent (for example on a first-page-only bill), leave that optional field blank or upload the breakdown page.
- Comparisons use actual saved bill amounts and units, with daily usage to account for unequal billing days. One bill per month is supported for each home. Different consumer numbers must go into different homes.
- Names, bill details, consumer numbers, devices, and conversations are saved in browser local storage. Raw files are not retained. This is not authentication or cloud sync: anyone using the same browser profile can access the workspace. Use your own device; clearing site data removes it.

## Ways to reduce electricity

**Your next small steps** ranks modeled changes by possible saving for the selected bill. Use **Show all ways to save** to see the rest, including maintenance and efficiency advice matched to your actual devices. Tips without a rupee figure do not have a quantified saving.

The default insights view keeps longer instructions and evidence inside **Assumptions**, **How to do it**, and **How fewer units reduce your cost**. The water card is at the bottom. Conservation guidance is linked to the [US Department of Energy Energy Saver guide (2022)](https://www.energy.gov/sites/default/files/2022-08/energy-saver-guide-2022.pdf), particularly cooling, laundry, dishwashing, computer sleep and lighting. This supports habits, not universal Indian appliance savings or imported US tariffs.

**What if I made a change?** includes the existing AC temperature, geyser standby, and BLDC fan options plus device-specific presets: an unused hour of AC, fan, or computer time; ten minutes less geyser heating when less hot water is needed; and thirty minutes less washing-machine or dishwasher runtime per week when loads can be combined. The displayed assumptions apply to the quantity you entered. These are optional what-if schedules, not claims about your actual idle time or wash-cycle energy.

Use **See the impact** to apply a modeled recommendation. Multiple changes combine in one estimate using the actual billing period and device quantities. Individual savings can overlap and should not be added together. Unchecking an option or **Reset changes** restores the corresponding baseline; your saved devices are never edited by the simulator.

There are no runtime-cut suggestions for refrigerators, networking equipment, or essential charging. Appliance-specific maintenance tips instead cover fridge seals and ventilation, AC filters, suitable cold/eco washes, computer sleep, cookware, hot-water leaks, and EV efficiency. When the listed device model exceeds billed usage by more than 20%, quantified recommendations and the projected bill are withheld until you check the inventory.

Useful non-quantified device tips still appear when inventory estimates need correction.

## Official tariff basis

Cost estimates use LT I(B) residential **published total variable (energy + wheeling) charges** for the selected bill month. Supported periods:

- April 2021–March 2022: [MERC Case 322/2019, Table 8-17](https://www.mahadiscom.in/consumer/wp-content/uploads/2020/03/Order-322-of-2019.pdf), PDF p. 492.
- July 2025–March 2026 and April 2026–March 2027: [MERC Case 75/2025, post-remand order dated 25 March 2026](https://www.mahadiscom.in/wp-content/uploads/2026/07/Tariff-Order_Case-No.-75-of-2025-dated-25th-March-2026.pdf), pp. 94–95. These supersede relying on an earlier review table or a search summary. Published total-variable values are used as printed, including rounding differences from separately printed energy and wheeling.

Savings remove units from the highest occupied slab first. More summer consumption can move into higher slabs, but the model does not invent a summer rate multiplier. Monthly FAC, duty/tax and time-of-use effects are not quantified; uploaded fixed charges, arrears and adjustments remain in the baseline. Monthly 100/300/500-unit boundaries illustrate cost sensitivity, not exact bill-period proration.

For unverified periods, the app explicitly shows **Rate not verified**, keeps unit simulations available, and withholds rupee projections rather than applying today's tariff to an old bill. Tariff schedules are bundled snapshots, not an automatically updating government feed.

## Generation-water insight

The selected bill includes a freshwater equivalent using its actual kWh and WRI's estimated **2.2 m³/MWh (2.2 litres/kWh)** consumption intensity for India's thermal-power portfolio in **2016**. Source: [Parched Power (WRI, 2018), p. 16](https://files.wri.org/d8/s3fs-public/parched-power-india.pdf).

This is a historical thermal-power benchmark for scale, **not** measured household water use, a current Maharashtra grid average, or water withdrawn by power plants. The current generation mix, cooling technology, and transmission/distribution losses are not known from a residential bill. Do not present the value as the actual water consumed to supply that home.

## Conversational assistant

Two clearly labeled modes are available:

1. **Guided chat:** instant, lightweight conversation for recording devices and moving through cooling, hot water, kitchen/laundry, and other loads. This is not generative AI.
2. **Private browser AI:** select **Enable private AI** to load WebLLM's `Qwen2.5-0.5B-Instruct-q4f32_1-MLC` model in a worker. It needs a compatible WebGPU browser/GPU, approximately 1 GB GPU memory, and an initial model download of several hundred MB. Model assets are fetched from WebLLM's public model hosts and cached by the browser. Model downloads do not send prompts. No API key, Ollama installation, AI provider calls, or AI backend are required.

The AI produces schema-validated device suggestions; the user must confirm power, quantity, schedule, and relevant AC/geyser settings before devices enter the inventory. Model/load/generation errors are shown explicitly. Unsupported devices can still choose guided chat. AI releases GPU resources when leaving the assistant; switching homes may reload the cached model. Model answers are not a source of tariff or hardware facts.

For geysers, time spent heating is separate from being left switched on between uses. “Left on all day” selects standby but leaves heating hours for you to confirm; it does not assume 24 hours of continuous heating.

## Approximate device consumption

Every device type starts with editable approximate watts, so knowing its specifications is not required. Users still confirm quantity and daily usage. The editor and saved list show approximate kWh/day using the same consumption model as the dashboard; this is not a meter reading. Existing saved powers are never overwritten.

New household choices include:

| Device | Starting estimate | Other selectable estimates |
| --- | ---: | --- |
| Television | 100 W (roughly 43–55-inch LED) | 170 W for a larger TV |
| Speaker | 20 W (small / desktop speakers) | 100 W soundbar / home theatre |
| Light bulb | 10 W LED | 15 W CFL; 60 W older incandescent |
| Tube light | 20 W LED tube / batten | 40 W older fluorescent |
| Mobile charger | 10 W active charging | 25 W fast charging |
| Water purifier | 40 W approximate RO use | Manufacturer references below |
| Inverter | 20 W assumed extra-loss / idle allowance | Editable watts |

These generic presets are rough planning assumptions, not verified model specifications, constant measured draw, or current BEE ratings. Phone charging uses active charging hours, not all the time an adapter is plugged in. Guided and private-AI device entry recognize TVs, speakers/soundbars, bulbs, tube lights and mobile/phone chargers.

**Inverter** covers home battery-backup/UPS systems, not inverter ACs. The 20 W default is an **assumption**, not a sourced typical loss or a battery-health diagnosis. It covers an illustrative extra-loss/idle allowance, not output VA or full charging power; connected appliances are already counted separately. Actual active-conversion and charging losses can differ. Edit the allowance if measured or manufacturer-confirmed values are available.

Battery backup duration (for example 6, 8, 12 or 24 hours before running out) does not determine watts or daily grid consumption. Guided entry does not treat an unqualified backup-duration claim as daily inverter running hours. Specify actual daily hours at the assumed extra-loss level; no runtime or battery capacity is invented.

**Water purifier** includes Aquaguard, RO and UV units. Keep the editable 40 W assumption, enter known watts, or choose a clearly labelled **Approximate power reference** for a similar purifier:

- Aquaguard Delight NXT UV+UF: **20 W maximum rating**, [official manual, p. 3](https://www.eurekaforbes.com/media/downloadfiles/usermanual/NXT_RO%2BUV%2BTA.pdf#page=3).
- Aquaguard Delight NXT RO+UV+TA and RO+UV+UF+TA: **40 W maximum rating**, [official manual, pp. 4 and 6](https://www.eurekaforbes.com/media/downloadfiles/usermanual/NXT_RO%2BUV%2BTA.pdf#page=4).
- KENT Grand Plus: **60 W total power consumption rating**, [official product specifications](https://www.kent.co.in/products/kent-grand-plus).

These are model-specific ratings, not measured household draw or universal Aquaguard specifications. The selected reference and source stay visible in the saved device list. Editing watts or reading them from a label clears the reference attribution. Existing devices are not automatically changed.

Confirm **active filtering hours**; the app does not assume a pump runs all day because it is plugged in. Separate standby/in-tank UV consumption is not estimated, and no annual energy figure is invented from these ratings. Needed hygiene and backup operations are never proposed as runtime cuts.

## Publishing

### GitHub Pages

The [deployment workflow](.github/workflows/deploy.yml) installs dependencies, runs tests and lint, builds the app, and publishes `dist` whenever `main` is updated. It can also be started manually.

1. Open [repository Settings > Pages](https://github.com/mrajat31/wattwise/settings/pages).
2. Under **Build and deployment**, select **GitHub Actions** as the **Source**.
3. Open [Actions](https://github.com/mrajat31/wattwise/actions), select **Deploy WattWise to GitHub Pages**, and choose **Run workflow** on `main` if the initial push ran before Pages was enabled.
4. Once deployment succeeds, open **https://mrajat31.github.io/wattwise/**.

Production builds and previews use `/wattwise/` so JavaScript, styles, and workers resolve correctly on this project site. `npm run dev` still serves at `/`; use `npm run preview` and open `http://localhost:4173/wattwise/` to check the production build locally. For a different repository path or a root/custom-domain deployment, update the production `base` in [vite.config.ts](vite.config.ts) before building.

GitHub Pages uses a different browser-storage origin from localhost. Existing local profiles and bills do not transfer automatically: create a profile and upload your bills on the hosted site. Profiles remain local to each browser and are not published in the repository.

### Hosting requirements

Build with `npm run build` and publish `dist` to a static HTTPS host using the configured base path. Serve JavaScript workers with correct MIME types. HTTPS is needed for WebGPU outside localhost; network access to the public model and OCR language asset hosts is needed on first use. Review model licenses and browser/device compatibility before release.

No application API/server secrets are required. There are no per-conversation API charges, but ordinary static hosting/bandwidth costs and the visitor's model-download data costs still apply. Browser AI is optional: the rest of the site must remain usable if model hosts are unavailable or the visitor declines the download.

## Estimates, not guaranteed savings

Uploaded amounts and units are preserved as the baseline. Device physics use user-confirmed schedules and indicative catalog/generic power values; those are not exact meter measurements. Savings are deterministic differences across the supported government tariff slabs, excluding unverified FAC/tax effects, with device use scaled to the bill's actual billing days. Combined simulation savings are calculated together rather than adding overlapping recommendations.

If modeled device usage exceeds the uploaded meter usage by more than 20%, the recommended next step is to correct the inventory and schedules; quantified savings recommendations are withheld until then.

The supported tariff values were checked against the linked MERC orders; the model catalog has not been verified against the latest manufacturer/BEE database. Do not present projections as exact future bills. New orders, FAC, taxes, arrears, credits, weather, and appliance duty cycles can affect actual bills. Missing device coverage is not evidence of phantom loads or hardware degradation.
