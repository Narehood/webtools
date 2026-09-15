const TRACKING = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_cid",
  "utm_reader",
  "utm_name",
  "utm_social",
  "utm_social-type",
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "twclid",
  "li_fat_id",
  "igshid",
  "mc_eid",
  "mc_cid",
  "_hsenc",
  "_hsmi",
  "hsa_acc",
  "hsa_cam",
  "hsa_grp",
  "hsa_ad",
  "hsa_src",
  "hsa_net",
  "hsa_ver",
  "mkt_tok",
  "icid",
  "spm",
  "scm",
  "yclid",
  "ysclid",
  "ttclid",
  "srsltid",
  "gad_source",
  "gad_campaignid",
  "pk_campaign",
  "pk_kwd",
  "pk_source",
  "vero_id",
  "wickedid",
  "oly_anon_id",
  "oly_enc_id",
  "_openstat",
  "mc_eid",
  "igsh",
  "si",
  "ndclid",
]);

const PREFIXES = ["utm_", "hsa_", "pk_", "mt_", "oly_"];

export function isTrackingParam(key: string) {
  const lower = key.toLowerCase();
  if (TRACKING.has(lower)) return true;
  return PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function cleanUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste a URL");
  const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  const removed: string[] = [];
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) {
      removed.push(key);
      url.searchParams.delete(key);
    }
  }
  return { href: url.toString(), host: url.host, removed };
}
