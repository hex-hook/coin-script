
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


/**
 * 获取日志时间
 * @returns 
 */
export function nowDateTimeString() {
    return new Date().toLocaleString()
}

/**
 * 根据交互次数和总时间获取睡眠时间范围
 * 确保交互间隔大于等于 5s 且小于等于 30min
 * @param count 交互次数
 * @param time 交互总时间(小时) 默认 23 小时
 */
export function getSleepScope(count: number, time: number = 23): [number, number] {
    if (count == 0) {
        throw new Error('count should not be 0')
    }
    const h = 60 * 60 * 1000
    // 最小等待时长 5s
    const min = 5 * 1000
    // 最大等待时长 30min，时间太长意义不大
    const max = 30 * 60 * 1000
    const avg = time * h / count
    

    // 如果交互间隔小于 5s 则返回 5s ~ 10s，来避免频繁交互
    if (avg <= min) {
        console.warn(`${nowDateTimeString()} avg < 5s, sleep 5s ~ 10s, Maybe we'll be late for some tasks.`)
        return [min, 10 * 1000]
    } else if (avg >= max) {
        return [min, max]
    }
    // 5s ~ avg
    return [5 * 1000, Math.floor(avg)]
}