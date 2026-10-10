export async function openLink(url: string) {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
  if (window.notebookDesktop) await window.notebookDesktop.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
