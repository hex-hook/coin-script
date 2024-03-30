import { ethers } from 'ethers'
import config from './config.toml'

/**
 * 查询配置中对应的钱包地址的 sepolia ETH 余额
 * 要用 eclipse 的跨链、转账等交互需要保证 sepolia 的余额充足
 * @returns 
 */
async function querySepolia() {
    const mnemonic = config.wallet.mnemonic
    if (!mnemonic || mnemonic.split(' ').length < 12) {
        console.error('mnemonic is invalid, see config.toml')
        return
    }
    const provider = new ethers.JsonRpcProvider(config.sepolia.rpc)
    const res = []
    for (let i = 0; i < config.wallet.count; i++) {
        // 兼容 phantom 的 eth 派生方式
        const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, "", `m/44'/60'/0'/0/${i}`)
        const balance = await provider.getBalance(wallet.address)
        res.push({address: wallet.address, balance: ethers.formatEther(balance)})
    }
    console.table(res)
}

querySepolia()