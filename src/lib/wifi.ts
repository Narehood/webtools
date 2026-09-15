function escapeWifi(value: string) {
  return value.replace(/([\\;,:])/g, "\\$1");
}

export function wifiPayload(ssid: string, password: string, security: "WPA" | "WEP" | "nopass", hidden: boolean) {
  const name = ssid.trim();
  if (!name) throw new Error("Enter an SSID");
  if (security !== "nopass" && !password) throw new Error("Enter the Wi-Fi password");
  const type = security === "nopass" ? "nopass" : security;
  const secret = security === "nopass" ? "" : `P:${escapeWifi(password)};`;
  const hide = hidden ? "H:true;" : "";
  return `WIFI:T:${type};S:${escapeWifi(name)};${secret}${hide};`;
}
