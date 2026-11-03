importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

// the ad blocker (tools.js): ad and tracker servers get no answer. The page's switch arrives by message, or is read
// from Cache Storage when this worker has just started; it's on unless switched off
const AD_HOSTS = new Set(["doubleclick.net","googlesyndication.com","googleadservices.com","googletagservices.com","google-analytics.com","analytics.google.com","adservice.google.com","pagead2.googlesyndication.com","imasdk.googleapis.com","2mdn.net","admob.com","adnxs.com","adsrvr.org","amazon-adsystem.com","advertising.com","adform.net","adroll.com","adcolony.com","adtech.de","bidswitch.net","casalemedia.com","contextweb.com","criteo.com","criteo.net","districtm.io","emxdgt.com","gumgum.com","indexww.com","kargo.com","lijit.com","media.net","mgid.com","openx.net","outbrain.com","pubmatic.com","revcontent.com","rubiconproject.com","sharethrough.com","smartadserver.com","sovrn.com","spotxchange.com","spotx.tv","taboola.com","teads.tv","3lift.com","triplelift.com","33across.com","tremorhub.com","yieldmo.com","zemanta.com","zergnet.com","serving-sys.com","adsafeprotected.com","doubleverify.com","moatads.com","iasds01.com","adition.com","adtelligent.com","undertone.com","yahoo-ads.com","ads.yahoo.com","adtechus.com","popads.net","popcash.net","propellerads.com","propellerclick.com","adsterra.com","adsterratech.com","exoclick.com","exosrv.com","juicyads.com","trafficjunky.net","hilltopads.net","a-ads.com","adcash.com","admaven.com","clickadu.com","galaksion.com","onclickads.net","onclkds.com","richpush.co","monetag.com","scorecardresearch.com","quantserve.com","quantcount.com","chartbeat.com","chartbeat.net","hotjar.com","hotjar.io","mouseflow.com","crazyegg.com","fullstory.com","clarity.ms","bat.bing.com","demdex.net","everesttech.net","mathtag.com","mookie1.com","krxd.net","bluekai.com","exelator.com","rlcdn.com","agkn.com","crwdcntrl.net","eyeota.net","tapad.com","liveintent.com","id5-sync.com","adsymptotic.com","omtrdc.net","newrelic.com","nr-data.net","pixel.facebook.com","ads-twitter.com","analytics.twitter.com","ads.linkedin.com","px.ads.linkedin.com","analytics.tiktok.com","ads.tiktok.com","an.yandex.ru","mc.yandex.ru","adfox.ru"]);
let adblock = null;
self.addEventListener("message", (e) => { if (e.data && typeof e.data.adblock === "boolean") adblock = e.data.adblock; });
async function adblockOn() {
	if (adblock === null) { try { const r = await (await caches.open("cb-settings")).match("/adblock"); adblock = r ? (await r.text()) !== "0" : true; } catch (e) { adblock = true; } }
	return adblock;
}
// the site a /scramjet/<address> request is for, when it's an ad or tracker server
function adHost(url) {
	let host;
	try { host = new URL(decodeURIComponent(new URL(url).pathname.slice("/scramjet/".length))).hostname; } catch (e) { return null; }
	for (let h = host; ; ) { if (AD_HOSTS.has(h)) return host; const i = h.indexOf("."); if (i < 0) return null; h = h.slice(i + 1); }
}

async function handleRequest(event) {
	await scramjet.loadConfig();
	if (scramjet.route(event)) {
		const req = event.request, ad = adHost(req.url);
		// a tab opening the page itself (asked for by the browser, not by a page in it) is never blocked
		const opened = req.mode === "navigate" && !(req.referrer || "").includes("/scramjet/");
		if (ad && !opened && await adblockOn()) {
			if (req.mode !== "navigate") return Response.error();
			return new Response('<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;font:13px system-ui,sans-serif;color:#888">Blocked by the ad blocker: ' + ad + '</body>', { headers: { "content-type": "text/html; charset=utf-8" } });
		}
		const res = await scramjet.fetch(event);
		// a file a page opens (rather than shows) goes to Curl Browser's downloads list, which shows its progress
		// (tools.js); the body is handed over as it arrives, and the frame stays on its page (204)
		if (req.mode === "navigate" && res.body && isFile(res)) {
			const page = await browserPage();
			let url = "";
			try { url = decodeURIComponent(new URL(req.url).pathname.slice("/scramjet/".length)); } catch (e) {}
			if (page && url) {
				try {
					page.postMessage({ cbDownload: { url, cd: res.headers.get("content-disposition") || "", type: (res.headers.get("content-type") || "").split(";")[0], size: +res.headers.get("content-length") || 0 }, body: res.body }, [res.body]);
					return new Response(null, { status: 204 });
				} catch (e) {}
			}
		}
		return res;
	}
	return fetch(event.request);
}
// what a browser shows itself; anything else a page opens is a download
const SHOWN = ["text/", "image/", "video/", "audio/", "application/pdf", "application/json", "application/xml", "application/javascript", "application/xhtml"];
function isFile(res) {
	if ((res.headers.get("content-disposition") || "").toLowerCase().startsWith("attachment")) return true;
	const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
	return !!type && !SHOWN.some((s) => type.startsWith(s)) && !type.endsWith("+xml") && !type.endsWith("+json");
}
// Curl Browser's own page (not a proxied one): the one in front, if there are several
async function browserPage() {
	const pages = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter((c) => ["/", "/index.html"].includes(new URL(c.url).pathname));
	return pages.find((c) => c.focused) || pages.find((c) => c.visibilityState === "visible") || pages[0];
}

self.addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
