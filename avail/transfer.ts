import { ApiPromise, Keyring, WsProvider } from '@polkadot/api'
import config from '@/avail/config.toml'
import { types } from './spec/types'
import { rpc } from './spec/rpc'
import { signedExtensions } from './spec/signedExtensions'
import { shuffle } from '../util/random'
import BN from 'bn.js'
import { sleepRandom } from '../util/time'

const options = { app_id: 0, nonce: -1 }

async function init() {
    const provider = new WsProvider(config.ws)
    const api = await ApiPromise.create({
        provider,
        noInitWarn: true,
        types,
        rpc,
        signedExtensions
    })
    return api
}


async function main() {
    const mnemonic = config.wallet.mnemonic
    const faucetMnemonic = config.wallet.faucetMnemonic
    if (config.wallet.mnemonic.split(' ').length < 12 || config.wallet.faucetMnemonic.split(' ').length < 12) {
        console.error('mnemonic or faucet mnemonic failed, see config.toml')
        return
    }
    const api = await init()
    const factor = new BN(10).pow(new BN(api.registry.chainDecimals))
    // 0.02
    const amount = factor.divn(50)
    const faucet = new Keyring({ type: 'sr25519' }).createFromUri(faucetMnemonic)
    const { data: totalBalance } = (await api.query.system.account(faucet.address)) as unknown as { data: any };
    // 计算资产够分发的数量(未考虑磨损，实际上会少一些)
    const total = totalBalance.free.div(amount).toNumber()
    console.log(`faucet total balance: ${totalBalance.free.toString()} send amount: 0.02 * ${total}`)
    // 需要分发的助记词
    const targets: string[] = []
    for (let i = 0; i < total; i++) {
        targets.push(new Keyring({ type: 'sr25519' }).createFromUri((`${mnemonic}//${i}`)).address)
    }
    // 打乱顺序
    const targetsList: string[] = shuffle(targets)

    let success = 0;
    try {
        for (const target of targetsList) {
            try {
                await api.tx.balances.transfer(target, amount).signAndSend(faucet, options)
                success++
                await sleepRandom(1000, 10000)
                console.log(`transfer to ${target} success`)
            } catch (error) {
                console.error(`transfer to ${target} failed`, error)
                continue
            }
        }

        console.log(`transfer success ${success}/${targetsList.length}`)
    } catch (error) {
        console.error(`transfer failed`, error)
    } finally {
        await api.disconnect()
    }

}

main()