export async function retry(fn, { retries = 3, minDelay = 500, factor = 2 } = {}) {
  let attempt = 0;
  let delay = minDelay;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      await new Promise((res) => setTimeout(res, delay));
      delay *= factor;
    }
  }
}
