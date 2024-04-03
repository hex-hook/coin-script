import { ethers } from "ethers";
import config from './config.toml'
import { nowDateTimeString, sleepRandom } from "../util/time";
import { HDWallet } from '../util/solana'
import { LAMPORTS_PER_SOL, Connection, PublicKey } from "@solana/web3.js";
import { randomElement, randomIndexList } from "../util/random";

/**
 * 调用 sepolia 智能合约跨链到 eclipse testnet
 * @param wallet 钱包
 * @param address 目标 solana 地址 base58 编码
 * @param amount 转账金额
 */
async function depositToEtherBridge(wallet: ethers.Wallet, address: string, amount: number) {

    // sepolia 跨链桥地址
    const depositContractAddress = '0x7C9e161ebe55000a3220F972058Fb83273653a6e'
    // sepolia 跨链桥 abi
    const depositAbi = [
        'function deposit(bytes32,uint256,uint256)'
    ]
    const contract = new ethers.Contract(depositContractAddress, depositAbi, wallet);

    const gasFee = ethers.parseEther(config.sepolia.gas)
    const amountWei = ethers.parseEther(`${amount}`)
    const totalWei = gasFee + amountWei
    try {
        const tx = await contract.deposit(Buffer.from(ethers.decodeBase58(address).toString(16), 'hex'), amountWei, gasFee, {
            value: totalWei
        })
        await tx.wait()
        console.log(`${nowDateTimeString()} [Sepolia] Address: [${wallet.address}] deposit to [${address}] [${amount} ETH] gas: [${config.sepolia.gas}] tx: ${tx.hash}`)
    } catch (e) {
        console.error(`${nowDateTimeString()} [Sepolia] Address: [${wallet.address}] deposit to [${address}] [${amount} ETH] gas: [${config.sepolia.gas}] failed`, e)
    }
}

/**
 * 随机获取可跨链的 sepolia eth 金额
 * @param provider sepolia rpc provider
 * @param address 地址
 * @returns 
 */
async function getRandomETH(provider: ethers.Provider, address: string): Promise<number> {
    const balance = await provider.getBalance(address)
    const balanceETH = parseFloat(ethers.formatEther(balance))
    // gas fee 接近 0.0002，资产低于这值时不再跨链
    if (balance < 0.01) {
        return 0
    }
    // 跨链金额随机，可按照需要调整
    const randomAmounts = [0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.15, 0.17]
    const filterAmounts = randomAmounts.filter(v => v < balanceETH)
    if (filterAmounts.length == 0) {
        return 0
    }
    return randomElement(filterAmounts)
}

/**
 * 查询 sol 资产
 * @param connection connect
 * @param address 地址
 * @returns 
 */
async function getSolanaBalance(connection: Connection, address: string): Promise<number> {
    try {
        const result = await connection.getBalance(new PublicKey(address))
        return result / LAMPORTS_PER_SOL
    } catch (e) {
        console.error(`查询余额失败: ${address}`, e)
        return 0
    }
}

/**
 * 空投 sol（只支持 dev）
 * @param connection connect
 * @param address 空投地址
 */
async function requestAirdrop(connection: Connection, address: string) {
    try {
        const signature = await connection.requestAirdrop(new PublicKey(address), LAMPORTS_PER_SOL)
        console.log(`${nowDateTimeString()} [Sepolia] Address: [${address}] request airdrop success, ${signature}`)
    } catch (e) {
        console.error(`${nowDateTimeString()} [Sepolia] Address: [${address}] request airdrop failed`, e)
    }
}

/**
 * 跨链交互任务
 * 为了钱包间的隔离，根据 phantom 的派生方式 eth 地址领水，跨链到对应的 solana 地址
 * @returns 
 */
export async function task(index: number) {
    const mnemonic = config.wallet.mnemonic
    if (!mnemonic || mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    const provider = new ethers.JsonRpcProvider(config.sepolia.rpc)
    const connection = new Connection(config.eclipse.rpc)

    // 兼容 phantom 的 eth 派生方式
    const solanaWallet = new HDWallet(mnemonic, `m/44'/501'/${index}'/0`)
    // 当前资产大于 skipBalance 时跳过，不进行跨链
    const balance = await getSolanaBalance(connection, solanaWallet.address)
    if (balance > config.wallet.skipBalance) {
        console.log(`${nowDateTimeString()} [Sepolia] Address: [${solanaWallet.address}] balance is [${balance}] SOL, skip deposit`)
        return
    }

    const key = ethers.HDNodeWallet.fromPhrase(mnemonic, "", `m/44'/60'/0'/0/${index}`).privateKey
    const wallet = new ethers.Wallet(key, provider)
    const amount = await getRandomETH(provider, wallet.address)
    if (amount > 0) {
        await depositToEtherBridge(wallet, solanaWallet.address, amount)
    } else {
        console.log(`${nowDateTimeString()} [Sepolia] Address: [${wallet.address}] balance is not enough, skip deposit`)
    }
}

async function runTask() {
    const count = config.wallet.count
    const indexList = randomIndexList(count)
    for (const index of indexList) {
        try {
            await task(index)
        } catch (e) {
            console.error(`${nowDateTimeString()} [Sepolia bridge] Address: [${index}] task failed`, e)
        }
        // 随机等待 2-50 分钟
        await sleepRandom(1000 * 60 * 2, 1000 * 60 * 50)
    }
}

async function main() {
    if (config.wallet.mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    while (true) {
        try {
            await runTask()
        } catch (e) {
            console.error(`${nowDateTimeString()} [Sepolia bridge] main error`, e)
        }
        // 随机等待 16 ~ 36 小时
        await sleepRandom(1000 * 60 * 60 * 16, 1000 * 60 * 60 * 36)
    }
}

main()