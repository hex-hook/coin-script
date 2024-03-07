import { ethers } from "ethers";
import config from './config.toml'


/**
 * 创建钱包
 * @returns 随机生成一个 HD 钱包
 */
function createWallet() {
    const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(32))
    return ethers.HDNodeWallet.fromPhrase(mnemonic);
}


/**
 * 批量查询资产（串行）
 * @param provider 节点
 * @param wallet hd 钱包，用于生成地址
 * @param count 生成地址数量，默认100
 */
async function batchGetBalance(provider: ethers.Provider, wallet: ethers.HDNodeWallet, count: number = 100) {
    const start = Date.now();
    let success = 0;
    for (let i = 0; i < count; i++) {
        const child = wallet.deriveChild(i);
        try {
            const address = child.address;
            // 这里是串行的
            const balance = await provider.getBalance(address)
            if (balance > 0) {
                // 如果碰撞到有资产的地址，会将地址、私钥、资产打印出来，可从中获取资产（基本不可能）
                console.log(address, child.privateKey, ethers.formatEther(balance));
            }
            success++;
        } catch (e) {
            // ignore 偶尔失败是正常的，通常关注批量调用成功率即可，下面会记录

        }
    }
    console.log(`${new Date().toLocaleString()} get balance ${success}/${count} in ${Date.now() - start}ms`)
}



/**
 * 查询资产任务
 * @param url 节点地址
 */
async function task(url: string) {
    console.log(`${new Date().toLocaleString()} start task ${url}`);
    const provider = new ethers.JsonRpcProvider(url);
    while (true) {
        const wallet = createWallet();
        // 避免并发过高
        await batchGetBalance(provider, wallet);
    }
}



/**
 * 主函数
 */
function main() {
    config.lava.rpc.map((id: string) => `https://eth1.lava.build/lava-referer-${id}/`).forEach(task);
}


// 使用 bun run rpc.ts 运行(当前目录下)
main()