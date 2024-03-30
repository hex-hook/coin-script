
/**
 * 随机获取一个整数
 * @param min 最小值
 * @param max 最大值
 * @returns 
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机获取一个元素
 * @param array 数组
 * @returns 
 */
export function randomElement<T>(array: T[]): T {
  return array[randomInt(0, array.length - 1)];
}

/**
 * 打乱数组
 * @param array 数组
 * @returns 
 */
export function shuffle<T>(array: T[]): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 获取一个打乱顺序的索引列表
 * @param count 数量
 * @returns 
 */
export function randomIndexList(count: number): number[] {
  return shuffle(Array.from({ length: count }).map((_, index) => index))
}