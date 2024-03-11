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
 * @param provider rpc provider
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
            // 一次查询 1 积分
            const balance = await provider.getBalance(address)
            if (balance > 0) {
                // 如果碰撞到有资产的地址，会将地址、私钥、资产打印出来，可从中获取资产（基本不可能）
                // 使用 cat xxx.log | grep address 提取
                console.log(`address: ${address} key: ${child.privateKey} balance:${ethers.formatEther(balance)}`);
            }
            success++;
        } catch (e) {
            // ignore 偶尔失败是正常的，通常关注批量调用成功率即可，下面会记录

        }
    }
    console.log(`${new Date().toLocaleString()} get balance ${success}/${count} in ${Date.now() - start}ms`)
}


/**
 * 
 * @param provider rpc provider
 * @param wallet 钱包
 * @param contractAddress 合约地址
 * @param count 钱包数量
 */
async function batchGetBalanceWithToken(provider: ethers.Provider, wallet: ethers.HDNodeWallet, contractAddress: string, count: number = 100) {
    const contract = new ethers.Contract(contractAddress, ['function balanceOf(address) view returns (uint256)'], provider);
    const start = Date.now();
    let success = 0;
    for (let i = 0; i < count; i++) {
        const child = wallet.deriveChild(i);
        try {
            const address = child.address;
            // 这里是串行的
            const balance = await contract.balanceOf(address)
            if (balance > 0) {
                // 如果碰撞到有资产的地址，会将地址、私钥、资产打印出来，可从中获取资产（基本不可能）
                // 使用 cat xxx.log | grep address 提取
                console.log(`address: ${address} key: ${child.privateKey} token balance:${ethers.formatEther(balance)}`);
            }
            success++;
        } catch (e) {
            // ignore 偶尔失败是正常的，通常关注批量调用成功率即可，下面会记录

        }
    }
    console.log(`${new Date().toLocaleString()} get token balance ${success}/${count} in ${Date.now() - start}ms`)
}


/**
 * 查询资产任务
 * @param url 节点地址
 * @param times 查询次数，每天有积分上限
 */
async function task(url: string, times: number = 250) {
    console.log(`${new Date().toLocaleString()} start task ${url}`);
    const provider = new ethers.JsonRpcProvider(url);
    for (let i = 0; i < times; i++) {
        const wallet = createWallet();
        // 避免并发过高
        await batchGetBalance(provider, wallet);
    }
    console.log(`${new Date().toLocaleString()} end task [${times}] times ${url}`);
}


/**
 * 查询代币资产任务
 * @param url 节点地址
 * @param contractAddress 智能合约地址
 * @param times 查询次数，每天有积分上限
 */
async function taskWithToken(url: string, contractAddress: string, times: number = 250) {
    console.log(`${new Date().toLocaleString()} start token task ${url}`);
    const provider = new ethers.JsonRpcProvider(url);
    for (let i = 0; i < times; i++) {
        const wallet = createWallet();
        // 避免并发过高
        await batchGetBalanceWithToken(provider, wallet, contractAddress);
    }
    console.log(`${new Date().toLocaleString()} end token task [${times}] times ${url}`);
}



/**
 * 主函数
 */
async function main() {
    let hour = new Date().getHours();
    while (true) {
        config.lava.rpc.map((id: string) => `https://eth1.lava.build/lava-referer-${id}/`).forEach((url: string) => task(url));
        config.lava.rpc.map((id: string) => `https://eth1.lava.build/lava-referer-${id}/`).forEach((url: string)=>taskWithToken(url, config.lava.contract.eth.read));
        // 下一天重新开始
        const delay = (24 - hour) * 3600 * 1000;
        console.log(`next task will start after ${delay} ms`);
        await Bun.sleep(delay);
        hour = new Date().getHours();
    }
}


// 使用 bun run lava/rpc.ts 运行
main()