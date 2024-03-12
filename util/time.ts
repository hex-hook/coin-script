
/**
 * 随机等待 ${min} ~ ${max} ms
 * @param min default 500 ms
 * @param max default 2000ms
 */
export async function sleepRandom(min: number=500, max: number=2000) {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    await Bun.sleep(ms);
}


export function nowDateTimeString() {
    return new Date().toLocaleString()
}