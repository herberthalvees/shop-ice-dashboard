function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushSuportado() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function ehIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function instaladoNaTelaInicial() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function registrarServiceWorkerPush() {
  return await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function assinaturaAtual() {
  if (!pushSuportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export type AssinaturaSerializada = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function serializar(sub: PushSubscription): AssinaturaSerializada {
  return {
    endpoint: sub.endpoint,
    p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
    auth: arrayBufferToBase64Url(sub.getKey("auth")),
  };
}

export async function assinarPush(publicKey: string) {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("Permissão de notificação negada");
  const reg = await registrarServiceWorkerPush();
  await navigator.serviceWorker.ready;
  const existente = await reg.pushManager.getSubscription();
  if (existente) return serializar(existente);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  return serializar(sub);
}

export async function cancelarPush() {
  const sub = await assinaturaAtual();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}