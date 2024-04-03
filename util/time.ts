
/**
 * 随机等待 ${min} ~ ${max} ms
 * @param min default 500 ms
 * @param max default 2000ms
 */
export async function sleepRandom(min: number=500, max: number=2000) {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    if (ms < 1000) {
        console.log(`${nowDateTimeString()} sleep ${ms} ms`)
    } else if (ms < 1000 * 60) {
        console.log(`${nowDateTimeString()} sleep ${ms/1000} s`)
    } else if (ms < 1000 * 60 * 60) {
        console.log(`${nowDateTimeString()} sleep ${(ms/1000/60).toFixed(2)} m`)
    } else {
        console.log(`${nowDateTimeString()} sleep ${(ms/1000/60/60).toFixed(2)} h`)
    }
    await Bun.sleep(ms);
}


export function nowDateTimeString() {
    return new Date().toLocaleString()
}