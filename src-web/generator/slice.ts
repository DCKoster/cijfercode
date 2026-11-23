const SLICE_MS = 8;

export function generationSlice(cancelled?: () => boolean) {
  let resume = performance.now();
  return (force = false): Promise<void> | undefined => {
    if (cancelled?.()) throw new Error("Geannuleerd");
    if (!force && performance.now() - resume < SLICE_MS) return;
    return new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resume = performance.now();
        resolve();
      };
      channel.port2.postMessage(null);
    }).then(() => {
      if (cancelled?.()) throw new Error("Geannuleerd");
    });
  };
}
